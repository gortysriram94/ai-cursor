// PDFExtractor.ts
// Full client-side PDF handling — no server, no upload.
// Uses pdfjs-dist (npm) and tesseract.js (npm) — no CDN scripts, no CSP issues.
// Handles: text PDFs · scanned/image PDFs (OCR) · multi-column layouts · password-protected.

export interface PDFExtractResult {
  rows:         string[][];
  headers:      string[];
  pageCount:    number;
  rawText:      string;
  wasOCR:       boolean;
  wasEncrypted: boolean;
}

export interface PDFProgress {
  stage:   "loading" | "extracting" | "ocr" | "structuring";
  page?:   number;
  total?:  number;
  pct:     number;
  message: string;
}

// ── Singletons ────────────────────────────────────────────────────────────────

let pdfjsLib: any   = null;
let TesseractLib: any = null;

async function getPDFJS(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;
  const pdfjs = await import("pdfjs-dist");
  // Turbopack can't serve the PDF.js worker as a separate file the way webpack did.
  // Setting workerSrc to empty string forces single-threaded mode — slightly slower
  // but always works, and PDF processing is already async so UI stays responsive.
  pdfjs.GlobalWorkerOptions.workerSrc = "";
  pdfjsLib = pdfjs;
  return pdfjs;
}

async function getTesseract(): Promise<any> {
  if (TesseractLib) return TesseractLib;
  TesseractLib = await import("tesseract.js");
  return TesseractLib;
}

// ── Text item type ────────────────────────────────────────────────────────────

interface TextItem {
  str:    string;
  x:      number;
  y:      number;
  width:  number;
  height: number;
}

// ── Multi-column layout reconstruction ───────────────────────────────────────
// PDF.js gives X/Y for every text fragment. Naive Y-grouping merges columns.
// We find column gaps via horizontal density histogram, split items by column,
// then reconstruct each column independently top-to-bottom.

function detectColumns(items: TextItem[], pageWidth: number): number[] {
  const BUCKETS = 40;
  const bucketW = pageWidth / BUCKETS;
  const density = new Array(BUCKETS).fill(0);

  for (const item of items) {
    const s = Math.floor(item.x / bucketW);
    const e = Math.min(BUCKETS - 1, Math.floor((item.x + item.width) / bucketW));
    for (let b = s; b <= e; b++) density[b] += item.str.length;
  }

  const max = Math.max(...density, 1);
  const gaps: number[] = [];

  for (let b = 2; b < BUCKETS - 2; b++) {
    if (density[b] < max * 0.05 && density[b - 1] < max * 0.05) {
      const gapX = b * bucketW;
      if (gapX > pageWidth * 0.15 && gapX < pageWidth * 0.85) {
        if (!gaps.length || gapX - gaps[gaps.length - 1] > pageWidth * 0.05) {
          gaps.push(gapX);
        }
      }
    }
  }
  return gaps;
}

function groupByY(items: TextItem[]): string {
  const lineMap = new Map<number, TextItem[]>();
  for (const item of items) {
    const yKey = Math.round(item.y / 4) * 4;
    if (!lineMap.has(yKey)) lineMap.set(yKey, []);
    lineMap.get(yKey)!.push(item);
  }
  return Array.from(lineMap.entries())
    .sort(([a], [b]) => b - a) // PDF Y-axis is bottom-up
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map(i => i.str).join(" ").trim())
    .filter(Boolean)
    .join("\n");
}

function reconstructColumnarText(items: TextItem[], pageWidth: number): string {
  const splits = detectColumns(items, pageWidth);
  if (!splits.length) return groupByY(items);

  const bounds  = [0, ...splits, pageWidth];
  const columns = bounds.slice(0, -1).map((left, i) =>
    items.filter(item => item.x >= left && item.x < bounds[i + 1])
  );

  return columns.filter(c => c.length > 0).map(groupByY).join("\n\n");
}

// ── Table vs document detection ───────────────────────────────────────────────

function looksLikeTable(lines: string[]): boolean {
  const structured = lines.filter(l => /\t/.test(l) || /\s{3,}/.test(l)).length;
  return structured > lines.length * 0.25;
}

function parseTableLines(lines: string[]): { headers: string[]; rows: string[][] } {
  const rows = lines.filter(l => l.trim())
    .map(l => l.split(/\t|\s{3,}/).map(c => c.trim()).filter(Boolean));
  if (!rows.length) return { headers: ["Content"], rows: [] };

  const firstHasNums   = rows[0].some(c => /\d/.test(c));
  const othersHaveNums = rows.slice(1, 5).some(r => r.some(c => /\d/.test(c)));
  const maxCols        = Math.max(...rows.map(r => r.length));
  const pad            = (r: string[]) => [...r, ...Array(maxCols - r.length).fill("")];

  if (!firstHasNums && othersHaveNums) {
    return { headers: pad(rows[0]), rows: rows.slice(1).map(pad) };
  }
  return { headers: Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`), rows: rows.map(pad) };
}

function chunkDocument(fullText: string): { headers: string[]; rows: string[][] } {
  const pages = fullText.split("\f");
  const rows: string[][] = [];

  pages.forEach((pageText, idx) => {
    const sentences = pageText
      .replace(/\n{3,}/g, "\n\n")
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map(s => s.replace(/\n/g, " ").trim())
      .filter(s => s.length > 20);

    let chunk = "";
    for (const s of sentences) {
      if ((chunk + " " + s).length > 400 && chunk) {
        rows.push([String(idx + 1), chunk.trim()]);
        chunk = s;
      } else {
        chunk = chunk ? chunk + " " + s : s;
      }
    }
    if (chunk.trim()) rows.push([String(idx + 1), chunk.trim()]);
  });

  return { headers: ["Page", "Content"], rows };
}

// ── OCR a page via Canvas + Tesseract ────────────────────────────────────────

async function ocrPage(pdfPage: any, worker: any): Promise<string> {
  const viewport = pdfPage.getViewport({ scale: 2.0 });
  const canvas   = document.createElement("canvas");
  canvas.width   = Math.floor(viewport.width);
  canvas.height  = Math.floor(viewport.height);
  const ctx      = canvas.getContext("2d")!;
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  const { data: { text } } = await worker.recognize(canvas);
  return text || "";
}

// ── Main extract function ─────────────────────────────────────────────────────

export async function extractPDF(
  file:        File,
  password:    string = "",
  onProgress?: (p: PDFProgress) => void
): Promise<PDFExtractResult> {
  const emit = (p: PDFProgress) => onProgress?.(p);

  emit({ stage: "loading", pct: 5, message: "Loading PDF library…" });
  const pdfjs = await getPDFJS();

  emit({ stage: "loading", pct: 10, message: "Reading file…" });
  const buffer = await file.arrayBuffer();

  // ── Open (handles password) ───────────────────────────────────────────────

  let pdf: any;
  let wasEncrypted = false;

  try {
    const params: any = { data: buffer };
    if (password) params.password = password;
    pdf = await pdfjs.getDocument(params).promise;
  } catch (err: any) {
    if (err?.name === "PasswordException") {
      wasEncrypted = true;
      throw new Error(password ? "PDF_PASSWORD_INCORRECT" : "PDF_PASSWORD_REQUIRED");
    }
    throw err;
  }

  const pageCount     = pdf.numPages;
  const allPageTexts: string[] = [];
  let   totalChars    = 0;

  // ── Pass 1: text extraction ───────────────────────────────────────────────

  for (let i = 1; i <= pageCount; i++) {
    emit({
      stage: "extracting", page: i, total: pageCount,
      pct: 10 + Math.round((i / pageCount) * 45),
      message: `Extracting page ${i} of ${pageCount}…`,
    });

    const page     = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content  = await page.getTextContent();

    const items: TextItem[] = (content.items as any[])
      .filter((it: any) => it.str?.trim())
      .map((it: any) => ({
        str:    it.str,
        x:      it.transform[4],
        y:      it.transform[5],
        width:  it.width  ?? 0,
        height: it.height ?? 0,
      }));

    const pageText = reconstructColumnarText(items, viewport.width);
    allPageTexts.push(pageText);
    totalChars += pageText.length;
  }

  // ── Pass 2: OCR if text is sparse (scanned PDF) ───────────────────────────

  let wasOCR = false;

  if (totalChars / pageCount < 50) {
    wasOCR = true;
    emit({ stage: "ocr", pct: 55, message: "Scanned PDF detected — loading OCR engine…" });

    const { createWorker } = await getTesseract();
    const ocrWorker = await createWorker("eng", 1, {
      logger: (m: any) => {
        if (m.status === "recognizing text") {
          emit({
            stage: "ocr",
            pct:   55 + Math.round(m.progress * 35),
            message: `OCR: recognizing text ${Math.round(m.progress * 100)}%…`,
          });
        }
      },
    });

    for (let i = 1; i <= pageCount; i++) {
      emit({
        stage: "ocr", page: i, total: pageCount,
        pct:   55 + Math.round((i / pageCount) * 35),
        message: `OCR page ${i} of ${pageCount}…`,
      });
      const page = await pdf.getPage(i);
      allPageTexts[i - 1] = await ocrPage(page, ocrWorker);
    }

    await ocrWorker.terminate();
  }

  // ── Structure output ──────────────────────────────────────────────────────

  emit({ stage: "structuring", pct: 93, message: "Structuring content…" });

  const fullText  = allPageTexts.join("\f");
  const allLines  = allPageTexts.flatMap(t => t.split("\n"));
  const nonEmpty  = allLines.filter(l => l.trim());

  let headers: string[];
  let rows:    string[][];

  if (looksLikeTable(nonEmpty)) {
    const t = parseTableLines(nonEmpty);
    headers = t.headers;
    rows    = t.rows;
  } else {
    const c = chunkDocument(fullText);
    headers = c.headers;
    rows    = c.rows;
  }

  emit({ stage: "structuring", pct: 100, message: "Done." });

  return {
    rows, headers, pageCount,
    rawText: fullText.replace(/\f/g, "\n\n---\n\n"),
    wasOCR, wasEncrypted,
  };
}

// ── CSV conversion ────────────────────────────────────────────────────────────

export function pdfResultToCSV(result: PDFExtractResult): string {
  const esc = (s: string) =>
    s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;

  return [
    result.headers.map(esc).join(","),
    ...result.rows.map(r => r.map(esc).join(",")),
  ].join("\n");
}