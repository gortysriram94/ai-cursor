// TokenLift — unified self-contained Web Worker
// All logic is in ONE file — no ES module imports, works in all browsers.
// Features: multi-format parsing · cleaning · PII masking · context right-sizer · cost auditor

self.onmessage = async (e) => {
  const { action, rawData, fileName, fileBuffer, options, files } = e.data;

  // ── START_CLEAN — single file ─────────────────────────────────────────────
  if (action === "START_CLEAN") {
    const progress = (step, pct) => self.postMessage({ action: "PROGRESS", step, pct });
    try {
      progress("PARSING", 5);
      const format = detectFormat(fileName || "", rawData || "");

      progress("PARSING", 15);
      let normalized;
      if (format === "parquet") {
        normalized = await parseParquet(fileBuffer);
      } else {
        normalized = parseFormat(format, rawData);
      }

      if (!normalized || normalized.rows.length === 0) {
        self.postMessage({ action: "DONE", payload: emptyResult(rawData || "", format) });
        return;
      }

      progress("DEDUPING", 40);
      const result = runPipeline(normalized.headers, normalized.rows, rawData || "", format, options || {}, progress);
      self.postMessage({ action: "DONE", payload: result });
    } catch (err) {
      self.postMessage({ action: "ERROR", error: String(err) });
    }
    return;
  }

  // ── START_BATCH — multiple files processed in sequence ────────────────────
  // Receives: files = Array<{ rawData, fileName, fileBuffer, options }>
  // Reports:  BATCH_FILE_DONE per file, BATCH_DONE when all complete
  if (action === "START_BATCH") {
    if (!Array.isArray(files) || files.length === 0) {
      self.postMessage({ action: "BATCH_ERROR", error: "No files provided" });
      return;
    }

    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      self.postMessage({ action: "BATCH_FILE_START", index: i, fileName: file.fileName });

      try {
        const format = detectFormat(file.fileName || "", file.rawData || "");

        let normalized;
        if (format === "parquet") {
          normalized = await parseParquet(file.fileBuffer);
        } else {
          normalized = parseFormat(format, file.rawData);
        }

        let result;
        if (!normalized || normalized.rows.length === 0) {
          result = emptyResult(file.rawData || "", format);
        } else {
          result = runPipeline(
            normalized.headers,
            normalized.rows,
            file.rawData || "",
            format,
            file.options || {},
            () => {} // no per-file progress in batch — we track at file level
          );
        }

        results.push({ index: i, fileName: file.fileName, status: "done", payload: result });
        self.postMessage({
          action: "BATCH_FILE_DONE",
          index: i,
          fileName: file.fileName,
          payload: result,
        });
      } catch (err) {
        results.push({ index: i, fileName: file.fileName, status: "error", error: String(err) });
        self.postMessage({
          action: "BATCH_FILE_ERROR",
          index: i,
          fileName: file.fileName,
          error: String(err),
        });
      }
    }

    self.postMessage({ action: "BATCH_DONE", results });
    return;
  }
};

// ─── FORMAT DETECTION ────────────────────────────────────────────────────────

function detectFormat(fileName, rawData) {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (ext === "parquet") return "parquet";
  if (ext === "tsv") return "tsv";
  if (ext === "jsonl" || ext === "ndjson") return "jsonl";
  if (ext === "json") return "json";
  if (ext === "xml") return "xml";
  if (ext === "csv") return "csv";

  const sample = (rawData || "").trimStart().slice(0, 200);
  if (sample.startsWith("PAR1")) return "parquet";
  if (sample.startsWith("<")) return "xml";
  if (sample.startsWith("[") || sample.startsWith("{")) {
    const lines = rawData.split("\n").filter((l) => l.trim());
    if (lines.length > 1) {
      try { JSON.parse(lines[0]); JSON.parse(lines[1]); return "jsonl"; } catch {}
    }
    return "json";
  }
  if (sample.includes("\t")) return "tsv";
  if (sample.includes("|")) return "psv";
  if (sample.includes(";")) return "ssv";
  return "csv";
}

// Returns { delimiter, label } for display in the UI
function detectDelimiterMeta(format, rawData) {
  const firstLine = (rawData || "").split("\n")[0] || "";
  if (format === "tsv") return { delimiter: "\\t", label: "Tab-separated" };
  if (format === "psv") return { delimiter: "|",   label: "Pipe-separated" };
  if (format === "ssv") return { delimiter: ";",   label: "Semicolon-separated" };
  if (format === "csv") {
    // Double-check: could be semicolon or pipe even with .csv extension
    const tabCount  = (firstLine.match(/\t/g)  || []).length;
    const pipeCount = (firstLine.match(/\|/g)  || []).length;
    const semiCount = (firstLine.match(/;/g)   || []).length;
    const commCount = (firstLine.match(/,/g)   || []).length;
    if (tabCount  > commCount && tabCount  > pipeCount) return { delimiter: "\\t", label: "Tab-separated" };
    if (pipeCount > commCount && pipeCount > semiCount) return { delimiter: "|",   label: "Pipe-separated" };
    if (semiCount > commCount)                          return { delimiter: ";",   label: "Semicolon-separated" };
    return { delimiter: ",", label: "Comma-separated" };
  }
  return { delimiter: "", label: format.toUpperCase() };
}

function parseFormat(format, raw) {
  switch (format) {
    case "csv":   return parseCSV(raw, ",");
    case "tsv":   return parseCSV(raw, "\t");
    case "psv":   return parseCSV(raw, "|");
    case "ssv":   return parseCSV(raw, ";");
    case "json":  return parseJSON(raw);
    case "jsonl": return parseJSONL(raw);
    case "xml":   return parseXML(raw);
    default:      return parseCSV(raw, ",");
  }
}

// ─── CSV / TSV PARSER (RFC 4180 — handles multiline quoted fields) ────────────

function parseCSV(raw, delimiter) {
  const parsed = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    if (ch === '"') {
      if (inQuotes && raw[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      row.push(cell); cell = ""; i++;
      continue;
    }

    if ((ch === "\r" || ch === "\n") && !inQuotes) {
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) parsed.push(row);
      row = [];
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      i++;
      continue;
    }

    cell += ch;
    i++;
  }

  row.push(cell);
  if (row.some((c) => c.trim() !== "")) parsed.push(row);

  if (parsed.length === 0) return { headers: [], rows: [] };

  const maxCols = Math.max(...parsed.map((r) => r.length));
  let headers = (parsed[0] || []).map((h, idx) =>
    h.trim() === "" ? `Column ${String.fromCharCode(65 + idx)}` : h.trim()
  );
  while (headers.length < maxCols) {
    headers.push(`Column ${String.fromCharCode(65 + headers.length)}`);
  }

  const rows = parsed.slice(1).map((r) => {
    const trimmed = r.map((c) => c.trim());
    while (trimmed.length < maxCols) trimmed.push("");
    return trimmed;
  });

  return { headers, rows };
}

// ─── JSON PARSER ─────────────────────────────────────────────────────────────

function flattenObject(obj, prefix) {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(result, flattenObject(val, fullKey));
    } else if (Array.isArray(val)) {
      result[fullKey] = JSON.stringify(val);
    } else {
      result[fullKey] = val === null || val === undefined ? "" : String(val);
    }
  }
  return result;
}

function objectsToTable(objects) {
  if (!objects || objects.length === 0) return { headers: [], rows: [] };
  const flattened = objects.map((o) =>
    typeof o === "object" && o !== null && !Array.isArray(o)
      ? flattenObject(o, "")
      : { value: String(o) }
  );
  const keySet = new Set();
  for (const obj of flattened) for (const k of Object.keys(obj)) keySet.add(k);
  const headers = Array.from(keySet);
  const rows = flattened.map((obj) =>
    headers.map((h) => (obj[h] !== undefined ? String(obj[h]) : ""))
  );
  return { headers, rows };
}

function parseJSON(raw) {
  const parsed = JSON.parse(raw.trim());
  if (Array.isArray(parsed)) return objectsToTable(parsed);
  if (parsed && typeof parsed === "object") {
    for (const k of Object.keys(parsed)) {
      if (Array.isArray(parsed[k])) return objectsToTable(parsed[k]);
    }
    return objectsToTable([parsed]);
  }
  throw new Error("JSON structure not recognized. Expected an array of objects.");
}

function parseJSONL(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
  const objects = [];
  for (const line of lines) {
    try { objects.push(JSON.parse(line)); } catch {}
  }
  return objectsToTable(objects);
}

// ─── XML PARSER ──────────────────────────────────────────────────────────────

function parseXML(raw) {
  const doc = new DOMParser().parseFromString(raw, "text/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("Invalid XML: " + parseError.textContent?.slice(0, 100));

  const root = doc.documentElement;
  const childTagCounts = {};
  for (const child of root.children) {
    childTagCounts[child.tagName] = (childTagCounts[child.tagName] || 0) + 1;
  }
  let rowTag = null, maxCount = 0;
  for (const [tag, count] of Object.entries(childTagCounts)) {
    if (count > maxCount) { maxCount = count; rowTag = tag; }
  }
  let rowElements = rowTag ? Array.from(root.getElementsByTagName(rowTag)) : [];
  if (rowElements.length === 0) rowElements = Array.from(root.children);

  function elementToObject(el) {
    const obj = {};
    for (const attr of el.attributes) obj[`@${attr.name}`] = attr.value;
    for (const child of el.children) {
      const key = child.tagName;
      const val = child.children.length > 0
        ? JSON.stringify(elementToObject(child))
        : child.textContent?.trim() || "";
      obj[key] = obj[key] !== undefined ? obj[key] + " | " + val : val;
    }
    if (Object.keys(obj).length === 0) obj["value"] = el.textContent?.trim() || "";
    return obj;
  }

  return objectsToTable(rowElements.map(elementToObject));
}

// ─── PARQUET PARSER (via CDN) ─────────────────────────────────────────────────

async function parseParquet(fileBuffer) {
  let parquet;
  try {
    parquet = await import("https://cdn.jsdelivr.net/npm/parquet-wasm@0.6.1/esm/parquet_wasm.js");
    await parquet.default();
  } catch {
    throw new Error("Failed to load Parquet engine. Check your internet connection.");
  }
  const uint8 = new Uint8Array(fileBuffer);
  const table = parquet.readParquet(uint8);
  const headers = table.schema.fields.map((f) => f.name);
  const rows = [];
  for (let i = 0; i < table.numRows; i++) {
    const row = headers.map((_, colIdx) => {
      const col = table.getChildAt(colIdx);
      const val = col ? col.get(i) : null;
      if (val === null || val === undefined) return "";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    });
    rows.push(row);
  }
  return { headers, rows };
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

function toCsvString(headers, rows) {
  return [headers, ...rows]
    .map((row) =>
      row.map((c) =>
        c.includes(",") || c.includes('"') || c.includes("\n")
          ? `"${c.replace(/"/g, '""')}"` : c
      ).join(",")
    ).join("\n");
}

// ─── PII DETECTION & MASKING ─────────────────────────────────────────────────

const PII_PATTERNS = [
  { name: "email",      regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,  mask: "[EMAIL]" },
  { name: "phone",      regex: /(\+?1[\s.\-]?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/g, mask: "[PHONE]" },
  { name: "ssn",        regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,                         mask: "[SSN]" },
  { name: "creditCard", regex: /\b(?:\d[ \-]?){13,16}\b/g,                                  mask: "[CARD]" },
  { name: "ipv4",       regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,                  mask: "[IP]" },
  { name: "uuid",       regex: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, mask: "[ID]" },
  { name: "zipCode",    regex: /\b\d{5}(?:-\d{4})?\b/g,                                     mask: "[ZIP]" },
  { name: "dob",        regex: /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})\b/g, mask: "[DATE]" },
];

const PII_HEADER_KEYWORDS = [
  "email","mail","phone","mobile","cell","ssn","social","dob","birth",
  "ip","address","zip","postal","card","credit","uuid","name","first","last","user","contact"
];

function detectPIIColumns(headers, rows) {
  const suspects = [];
  for (let i = 0; i < headers.length; i++) {
    const hLower = headers[i].toLowerCase();
    if (PII_HEADER_KEYWORDS.some((k) => hLower.includes(k))) {
      suspects.push(headers[i]);
      continue;
    }
    const sample = rows.slice(0, 20).map((r) => r[i] || "").join(" ");
    for (const p of PII_PATTERNS) {
      if (p.regex.test(sample)) { suspects.push(headers[i]); break; }
      p.regex.lastIndex = 0;
    }
  }
  return [...new Set(suspects)];
}

function maskPII(rows, enabledTypes) {
  const active = PII_PATTERNS.filter((p) => enabledTypes.includes(p.name));
  let totalMasked = 0;
  const piiCountByType = {};
  const maskedRows = rows.map((row) =>
    row.map((cell) => {
      let val = cell;
      for (const p of active) {
        const matches = val.match(p.regex);
        if (matches) {
          totalMasked += matches.length;
          piiCountByType[p.name] = (piiCountByType[p.name] || 0) + matches.length;
          val = val.replace(p.regex, p.mask);
        }
      }
      return val;
    })
  );
  return { maskedRows, totalMasked, piiCountByType };
}

// ─── CONTEXT RIGHT-SIZER ─────────────────────────────────────────────────────

function contextRightSize(headers, rows, targetTokens) {
  if (!targetTokens || targetTokens <= 0) {
    return { croppedRows: rows, rowsDropped: 0, tokensFit: estimateTokens(toCsvString(headers, rows)) };
  }

  const headerTokens = estimateTokens(headers.join(",") + "\n");
  let budget = targetTokens - headerTokens;
  if (budget <= 0) return { croppedRows: [], rowsDropped: rows.length, tokensFit: headerTokens };

  const scored = rows.map((row, idx) => {
    const words = row.join(" ").split(/\s+/).filter(Boolean);
    const density = words.length > 0 ? new Set(words).size / words.length : 0;
    const rowTokens = estimateTokens(row.join(","));
    return { idx, row, density, rowTokens };
  });

  scored.sort((a, b) => b.density - a.density);

  let used = 0;
  const selected = [];
  for (const item of scored) {
    if (used + item.rowTokens <= budget) {
      selected.push(item);
      used += item.rowTokens;
    }
  }

  selected.sort((a, b) => a.idx - b.idx);
  return {
    croppedRows: selected.map((s) => s.row),
    rowsDropped: rows.length - selected.length,
    tokensFit: headerTokens + used,
  };
}

// ─── COST AUDITOR ─────────────────────────────────────────────────────────────

const MODEL_PRICING = [
  { provider: "OpenAI",    model: "GPT-4o",           inputPer1k: 0.005,    outputPer1k: 0.015  },
  { provider: "OpenAI",    model: "GPT-4o mini",      inputPer1k: 0.00015,  outputPer1k: 0.0006 },
  { provider: "OpenAI",    model: "GPT-4 Turbo",      inputPer1k: 0.01,     outputPer1k: 0.03   },
  { provider: "Anthropic", model: "Claude Sonnet 4",  inputPer1k: 0.003,    outputPer1k: 0.015  },
  { provider: "Anthropic", model: "Claude Haiku 4",   inputPer1k: 0.0008,   outputPer1k: 0.004  },
  { provider: "Google",    model: "Gemini 1.5 Pro",   inputPer1k: 0.00125,  outputPer1k: 0.005  },
  { provider: "Google",    model: "Gemini 1.5 Flash", inputPer1k: 0.000075, outputPer1k: 0.0003 },
  { provider: "Meta",      model: "Llama 3.1 405B",   inputPer1k: 0.003,    outputPer1k: 0.003  },
];

function runCostAudit(originalTokens, cleanedTokens, promptTemplateTokens, callsPerMonth) {
  const pTemplate = promptTemplateTokens || 0;
  const calls = callsPerMonth || 1000;
  // Output cost applied consistently to BOTH before and after.
  // Only the input token reduction drives the savings figure.
  const OUTPUT_RATIO = 0.3;

  return MODEL_PRICING.map((m) => {
    const inputBefore  = originalTokens + pTemplate;
    const inputAfter   = cleanedTokens  + pTemplate;
    const outputBefore = Math.round(inputBefore * OUTPUT_RATIO);
    const outputAfter  = Math.round(inputAfter  * OUTPUT_RATIO);

    const costPerCallBefore = (inputBefore  / 1000) * m.inputPer1k + (outputBefore / 1000) * m.outputPer1k;
    const costPerCallAfter  = (inputAfter   / 1000) * m.inputPer1k + (outputAfter  / 1000) * m.outputPer1k;
    const monthlyBefore     = costPerCallBefore * calls;
    const monthlyAfter      = costPerCallAfter  * calls;
    const savings           = monthlyBefore - monthlyAfter;

    return {
      provider:          m.provider,
      model:             m.model,
      inputPer1k:        m.inputPer1k,
      costPerCallBefore: costPerCallBefore.toFixed(5),
      costPerCallAfter:  costPerCallAfter.toFixed(5),
      monthlyBefore:     monthlyBefore.toFixed(2),
      monthlyAfter:      monthlyAfter.toFixed(2),
      monthlySavings:    Math.max(0, savings).toFixed(2),
      savingsPct:        monthlyBefore > 0 ? Math.max(0, parseFloat(((savings / monthlyBefore) * 100).toFixed(1))) : 0,
    };
  });
}

// ─── RAG JSONL BUILDER ───────────────────────────────────────────────────────

function buildRagJsonl(headers, rows, chunkSize, overlap, tokenBudget, chunkMode) {
  const docs   = [];
  let docIdx   = 0;

  const rowToText = (row) =>
    row.map((c, idx) => `${headers[idx] || "col_" + idx}: ${c}`).join(" | ");

  const rowToMeta = (row) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] || ""; });
    return obj;
  };

  // ── Mode: each row is its own document ────────────────────────────────────
  if (chunkMode === "column") {
    for (let i = 0; i < rows.length; i++) {
      const text = rowToText(rows[i]);
      docs.push(JSON.stringify({
        id: `doc_${docIdx++}`, text,
        metadata: rowToMeta(rows[i]),
        chunk_index: i, chunk_size: 1, source: "tokenlift",
      }));
    }
    return docs.join("\n");
  }

  // ── Mode: token budget — greedily fill chunks up to token limit ───────────
  if (chunkMode === "tokens") {
    const budget = Math.max(64, tokenBudget || 512);
    let chunk = [], tokenCount = 0, startIdx = 0;
    const flush = (endIdx) => {
      if (!chunk.length) return;
      const text = chunk.map(rowToText).join("\n");
      docs.push(JSON.stringify({
        id: `doc_${docIdx++}`, text,
        metadata: chunk.map(rowToMeta),
        chunk_index: startIdx, chunk_size: chunk.length, source: "tokenlift",
      }));
      chunk = []; tokenCount = 0; startIdx = endIdx;
    };
    for (let i = 0; i < rows.length; i++) {
      const rowTokens = Math.ceil(rowToText(rows[i]).length / 4);
      if (chunk.length > 0 && tokenCount + rowTokens > budget) flush(i);
      if (chunk.length === 0) startIdx = i;
      chunk.push(rows[i]);
      tokenCount += rowTokens;
    }
    flush(rows.length);
    return docs.join("\n");
  }

  // ── Mode: fixed row count (default) ───────────────────────────────────────
  const size = Math.max(1, chunkSize || 3);
  const step = Math.max(1, size - (overlap || 0));
  for (let i = 0; i < rows.length; i += step) {
    const chunk = rows.slice(i, i + size);
    const text  = chunk.map(rowToText).join("\n");
    docs.push(JSON.stringify({
      id: `doc_${docIdx++}`, text,
      metadata: chunk.map(rowToMeta),
      chunk_index: i, chunk_size: chunk.length,
      overlap: overlap || 0, source: "tokenlift",
    }));
  }
  return docs.join("\n");
}


// ─── VERTICAL NORMALIZERS ────────────────────────────────────────────────────

function toISO8601(dateStr) {
  if (!dateStr) return dateStr;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  } catch { return dateStr; }
  return dateStr;
}

function normalizeFinancial(headers, rows) {
  const log = [];
  const normalizedRows = rows.map(row =>
    row.map((cell, i) => {
      let val = cell;
      const header = headers[i].toLowerCase();

      // Strip currency symbols
      if (header.includes("price") || header.includes("amount") ||
          header.includes("cost") || header.includes("value") ||
          header.includes("p&l") || header.includes("pnl")) {
        const cleaned = val.replace(/[$£€,\s]/g, "");
        if (cleaned !== val) {
          log.push(`Currency stripped from ${headers[i]}`);
          return cleaned;
        }
      }

      // Normalize dates to ISO 8601
      if (header.includes("date") || header.includes("time")) {
        const iso = toISO8601(val);
        if (iso && iso !== val) {
          log.push(`Date normalized in ${headers[i]}`);
          return iso;
        }
      }

      // Normalize ticker symbols
      if (header.includes("symbol") || header.includes("ticker")) {
        return val.replace("/", ".").toUpperCase().trim();
      }

      return val;
    })
  );
  return { headers, rows: normalizedRows, normalizationLog: log };
}

function normalizeUXResearch(headers, rows) {
  const log = [];
  const normalizedRows = rows.map(row =>
    row.map((cell, i) => {
      let val = cell;
      const header = headers[i].toLowerCase();

      // Normalize task results
      if (header.includes("result") || header.includes("success") ||
          header.includes("complete")) {
        const lower = val.toLowerCase();
        if (lower.includes("fail") || lower === "f" || lower === "0" || lower === "no") {
          log.push("Task result normalized to: Fail");
          return "Fail";
        }
        if (lower.includes("pass") || lower.includes("success") ||
            lower === "p" || lower === "1" || lower === "yes") {
          log.push("Task result normalized to: Pass");
          return "Pass";
        }
      }

      // Normalize rating scales to 1-5
      if (header.includes("rating") || header.includes("score") ||
          header.includes("satisfaction")) {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          if (num > 5 && num <= 7)  return String(Math.round((num / 7)   * 5));
          if (num > 5 && num <= 10) return String(Math.round((num / 10)  * 5));
          if (num > 10)             return String(Math.round((num / 100) * 5));
        }
      }

      return val;
    })
  );
  return { headers, rows: normalizedRows, normalizationLog: log };
}

function normalizeAWS(headers, rows) {
  const AWS_REGIONS = {
    "us-east-1": "US East (N. Virginia)",
    "us-east-2": "US East (Ohio)",
    "us-west-1": "US West (N. California)",
    "us-west-2": "US West (Oregon)",
    "eu-west-1": "Europe (Ireland)",
    "eu-central-1": "Europe (Frankfurt)",
    "ap-southeast-1": "Asia Pacific (Singapore)",
    "ap-northeast-1": "Asia Pacific (Tokyo)",
  };

  const log = [];
  const normalizedRows = rows.map(row =>
    row.map((cell, i) => {
      let val = cell;
      const header = headers[i].toLowerCase();

      // Normalize regions
      if (header.includes("region")) {
        const readable = AWS_REGIONS[val.toLowerCase()];
        if (readable) { log.push(`Region normalized: ${val} → ${readable}`); return readable; }
      }

      // Strip currency from cost columns
      if (header.includes("cost") || header.includes("amount") || header.includes("charge")) {
        return val.replace(/[$,\s]/g, "");
      }

      // Simplify ARNs
      if (val.startsWith("arn:aws:")) {
        const parts = val.split(":");
        const simplified = `${parts[2]}/${parts[parts.length - 1]}`;
        log.push(`ARN simplified: ${val} → ${simplified}`);
        return simplified;
      }

      return val;
    })
  );
  return { headers, rows: normalizedRows, normalizationLog: log };
}

function normalizeBigQuery(headers, rows) {
  const log = [];
  const normalizedRows = rows.map(row =>
    row.map((cell, i) => {
      let val = cell;
      const header = headers[i].toLowerCase();

      // Convert bytes to human-readable
      if (header.match(/bytes|byte/)) {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          if (num >= 1e12)      { val = (num / 1e12).toFixed(2) + " TB"; log.push(`Bytes → TB: ${headers[i]}`); }
          else if (num >= 1e9)  { val = (num / 1e9).toFixed(2)  + " GB"; log.push(`Bytes → GB: ${headers[i]}`); }
          else if (num >= 1e6)  { val = (num / 1e6).toFixed(2)  + " MB"; log.push(`Bytes → MB: ${headers[i]}`); }
        }
      }

      // Normalize dates
      if (header.includes("date") || header.includes("time") || header.includes("timestamp")) {
        const iso = toISO8601(val);
        if (iso && iso !== val) {
          log.push(`Date normalized in ${headers[i]}`);
          return iso;
        }
      }

      // Strip cost symbols
      if (header.includes("cost") || header.includes("price") || header.includes("amount")) {
        return val.replace(/[$,\s]/g, "");
      }

      return val;
    })
  );
  return { headers, rows: normalizedRows, normalizationLog: log };
}

function normalizeByVertical(headers, rows, verticalId) {
  switch (verticalId) {
    case "trader":
      return normalizeFinancial(headers, rows);
    case "aws":
      return normalizeAWS(headers, rows);
    case "bigquery":
      return normalizeBigQuery(headers, rows);
    case "ux_research":
      return normalizeUXResearch(headers, rows);
    default:
      return { headers, rows, normalizationLog: [] };
  }
}

// ─── MAIN PIPELINE ────────────────────────────────────────────────────────────

function runPipeline(headers, rows, originalRaw, format, options, progress) {
  const p = progress || (() => {});
  const originalRowCount  = rows.length;
  const originalCharCount = originalRaw ? originalRaw.length : JSON.stringify({ headers, rows }).length;
  const originalTokens    = estimateTokens(originalRaw || JSON.stringify({ headers, rows }));
  const maxCols = headers.length;

  // 0. Vertical normalization (before cleaning)
  const normalized = normalizeByVertical(headers, rows, options.verticalId || "general");
  headers = normalized.headers;
  rows    = normalized.rows;
  const normalizationLog = normalized.normalizationLog;

  // 1. Trim cells, pad rows
  p("CLEANING", 50);
  let dataRows = rows.map((row) => {
    const trimmed = row.map((c) => String(c).trim());
    while (trimmed.length < maxCols) trimmed.push("");
    return trimmed;
  });

  // 2. Remove empty rows
  const beforeEmpty = dataRows.length;
  dataRows = dataRows.filter((row) => !row.every((c) => c === ""));
  const emptyRowsRemoved = beforeEmpty - dataRows.length;

  // 3. Deduplicate
  p("DEDUPING", 62);
  const seen = new Set();
  const deduped = [];
  for (const row of dataRows) {
    const key = row.join("\x00");
    if (!seen.has(key)) { seen.add(key); deduped.push(row); }
  }
  const duplicatesRemoved = dataRows.length - deduped.length;
  dataRows = deduped;

  // 4. Redundant column removal
  p("CLEANING", 72);
  const colsToRemove = new Set();
  for (let i = 0; i < maxCols; i++) {
    for (let j = i + 1; j < maxCols; j++) {
      if (!colsToRemove.has(i) && dataRows.every((row) => (row[i] ?? "") === (row[j] ?? ""))) {
        colsToRemove.add(j);
      }
    }
  }
  const redundantColumnsRemoved = colsToRemove.size;
  const filteredHeaders = headers.filter((_, i) => !colsToRemove.has(i));
  let filteredRows = dataRows.map((row) => row.filter((_, i) => !colsToRemove.has(i)));

  // 5. PII detection (always), masking (optional)
  p("CLEANING", 80);
  const piiSuspectColumns = detectPIIColumns(filteredHeaders, filteredRows);
  let piiTotalMasked = 0;
  let piiCountByType = {};
  if (options.maskPII) {
    const enabledTypes = options.piiTypes || PII_PATTERNS.map((p) => p.name);
    const piiResult = maskPII(filteredRows, enabledTypes);
    filteredRows = piiResult.maskedRows;
    piiTotalMasked = piiResult.totalMasked;
    piiCountByType = piiResult.piiCountByType;
  }

  // 6. Build cleaned CSV
  p("TOKENS", 88);
  const cleanedCSV    = toCsvString(filteredHeaders, filteredRows);
  const cleanedTokens = estimateTokens(cleanedCSV);
  const cleanedCharCount = cleanedCSV.length;
  const tokenReductionPct = originalTokens > 0
    ? Math.max(0, Math.round(((originalTokens - cleanedTokens) / originalTokens) * 100))
    : 0;

  // 7. Context right-sizer
  p("EXPORTS", 94);
  const targetTokens  = options.targetTokens || 0;
  const contextResult = contextRightSize(filteredHeaders, filteredRows, targetTokens);

  // 8. Cost audit
  const promptTemplateTokens = options.promptTemplateTokens || 0;
  const callsPerMonth        = options.callsPerMonth || 1000;
  const costAudit = runCostAudit(originalTokens, cleanedTokens, promptTemplateTokens, callsPerMonth);

  // 9. RAG JSONL
  const ragJsonl = buildRagJsonl(
    filteredHeaders, filteredRows,
    options.ragChunkSize   || 3,
    options.ragOverlap     || 0,
    options.ragTokenBudget || 512,
    options.ragChunkMode   || "rows",
  );

  // 10. Quality scores
  const dupRate   = originalRowCount > 0 ? duplicatesRemoved / originalRowCount : 0;
  const emptyRate = originalRowCount > 0 ? emptyRowsRemoved / originalRowCount : 0;
  const qualityBefore = Math.max(20, Math.min(75,
    Math.round(100 - dupRate * 60 - emptyRate * 30 - redundantColumnsRemoved * 5)
  ));
  const qualityAfter = Math.min(98, qualityBefore + Math.round(tokenReductionPct * 0.4) + 15);

  const outputRows = targetTokens > 0 ? contextResult.croppedRows : filteredRows;

  const delimiterMeta = detectDelimiterMeta(format, originalRaw);

  return {
    // Core
    normalizationLog,
    headers:               filteredHeaders,
    previewRows:           outputRows.slice(0, 10),
    cleanedData:           toCsvString(filteredHeaders, outputRows),
    ragJsonl,
    inputFormat:           format,
    delimiterLabel:        delimiterMeta.label,
    detectedEncoding:      options.detectedEncoding || "UTF-8",
    // Cleaning stats
    originalRowCount,
    cleanedRowCount:       filteredRows.length,
    duplicatesRemoved,
    emptyRowsRemoved,
    redundantColumnsRemoved,
    originalCharCount,
    cleanedCharCount,
    originalTokens,
    cleanedTokens,
    tokenReductionPct,
    qualityBefore,
    qualityAfter,
    // PII
    piiSuspectColumns,
    piiMaskEnabled:        !!options.maskPII,
    piiTotalMasked,
    piiCountByType,
    // Context sizer
    contextTargetTokens:   targetTokens,
    contextRowsDropped:    contextResult.rowsDropped,
    contextTokensFit:      contextResult.tokensFit,
    // Cost audit
    costAudit,
    promptTemplateTokens,
    callsPerMonth,
  };
}

function emptyResult(raw, format) {
  return {
    headers: [], previewRows: [], cleanedData: "", ragJsonl: "", inputFormat: format || "unknown",
    originalRowCount: 0, cleanedRowCount: 0, duplicatesRemoved: 0, emptyRowsRemoved: 0,
    redundantColumnsRemoved: 0, originalCharCount: raw.length, cleanedCharCount: 0,
    originalTokens: 0, cleanedTokens: 0, tokenReductionPct: 0, qualityBefore: 0, qualityAfter: 0,
    piiSuspectColumns: [], piiMaskEnabled: false, piiTotalMasked: 0, piiCountByType: {},
    contextTargetTokens: 0, contextRowsDropped: 0, contextTokensFit: 0,
    costAudit: [], promptTemplateTokens: 0, callsPerMonth: 1000,
  };
}
