// lib/rag.ts
// Converts cleaned CSV data into RAG-ready JSONL format.
// Called from RagExportButton with stats.ragJsonl (pre-built by worker)
// or can rebuild from raw cleanedData + headers if needed.

export function buildRagJsonl(
  cleanedData: string,
  headers?: string[],
  chunkSize = 3
): string {
  const lines = cleanedData.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "";

  // If headers not supplied, use first line
  const hdrs = headers || lines[0].split(",").map((h) => h.trim());
  const dataLines = headers ? lines : lines.slice(1);

  const docs: string[] = [];

  for (let i = 0; i < dataLines.length; i += chunkSize) {
    const chunk = dataLines.slice(i, i + chunkSize);

    const parsedRows = chunk.map((row) => {
      // Basic CSV split — good enough for already-clean data
      const cells: string[] = [];
      let cell = "";
      let inQ = false;
      for (const ch of row) {
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === "," && !inQ) { cells.push(cell); cell = ""; continue; }
        cell += ch;
      }
      cells.push(cell);
      return cells;
    });

    const text = parsedRows
      .map((cols) =>
        cols.map((c, idx) => `${hdrs[idx] ?? "col_" + idx}: ${c}`).join(" | ")
      )
      .join("\n");

    const metadata = parsedRows.map((cols) => {
      const obj: Record<string, string> = {};
      hdrs.forEach((h, idx) => { obj[h] = cols[idx] ?? ""; });
      return obj;
    });

    docs.push(
      JSON.stringify({
        id: `doc_${i}`,
        text,
        metadata,
        chunk_index: i,
        source: "tokenlift",
      })
    );
  }

  return docs.join("\n");
}
