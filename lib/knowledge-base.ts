// lib/knowledge-base.ts
// Semantic search across all datasets stored in OPFS.
// Vectors are generated locally via Transformers.js and stored in OPFS
// alongside the cleaned CSV — no server, no API, no cost.

interface VectorEntry {
  id: string;
  fileId: string;
  fileName: string;
  rowIndex: number;
  text: string;
  vector: number[];
}

// ── Index a dataset — generate embeddings and store vectors in OPFS ──────────

export async function indexDataset(
  fileId: string,
  fileName: string,
  headers: string[],
  rows: string[][],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const { embedBatch } = await import("./embeddings");

  // Convert each row to a searchable text string
  // Format: "Header1: value1 | Header2: value2 | ..."
  const texts = rows.map((row) =>
    row.map((cell, i) => `${headers[i] ?? `col_${i}`}: ${cell}`).join(" | ")
  );

  // Generate embeddings in batches of 10 to avoid blocking the main thread
  const batchSize = 10;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchEmbeddings = await embedBatch(batch);
    allEmbeddings.push(...batchEmbeddings);
    if (onProgress) onProgress(Math.min(i + batchSize, texts.length), texts.length);
  }

  // Build vector entries — one per row
  const entries: VectorEntry[] = rows.map((_, i) => ({
    id:        `${fileId}_${i}`,
    fileId,
    fileName,
    rowIndex:  i,
    text:      texts[i],
    vector:    allEmbeddings[i],
  }));

  // Save vectors to OPFS: tokenlift/datasets/{fileId}.vectors.json
  const root        = await navigator.storage.getDirectory();
  const dir         = await root.getDirectoryHandle("tokenlift",  { create: true });
  const datasetsDir = await dir.getDirectoryHandle("datasets",    { create: true });

  const vectorHandle   = await datasetsDir.getFileHandle(`${fileId}.vectors.json`, { create: true });
  const vectorWritable = await vectorHandle.createWritable();
  await vectorWritable.write(JSON.stringify(entries));
  await vectorWritable.close();

  // Update metadata — set hasEmbeddings: true
  const metaHandle = await datasetsDir.getFileHandle(`${fileId}.meta.json`);
  const metaFile   = await metaHandle.getFile();
  const meta       = JSON.parse(await metaFile.text());
  meta.hasEmbeddings = true;
  const metaWritable = await metaHandle.createWritable();
  await metaWritable.write(JSON.stringify(meta));
  await metaWritable.close();
}

// ── Semantic search across stored vector files ───────────────────────────────

export async function semanticSearch(
  query: string,
  fileIds?: string[],   // undefined = search all indexed files
  topK = 10,
  threshold = 0.6
): Promise<Array<{
  fileId: string;
  fileName: string;
  rowIndex: number;
  text: string;
  similarity: number;
}>> {
  const { embedText, cosineSimilarity } = await import("./embeddings");

  // Embed the search query using the same model
  const queryVector = await embedText(query);

  // Load all vector files from OPFS
  const root        = await navigator.storage.getDirectory();
  const dir         = await root.getDirectoryHandle("tokenlift");
  const datasetsDir = await dir.getDirectoryHandle("datasets");

  const allEntries: VectorEntry[] = [];

  for await (const [name, handle] of (datasetsDir as any).entries()) {
    if (!name.endsWith(".vectors.json")) continue;

    const fileId = name.replace(".vectors.json", "");
    if (fileIds && !fileIds.includes(fileId)) continue;

    const file    = await (handle as FileSystemFileHandle).getFile();
    const entries: VectorEntry[] = JSON.parse(await file.text());
    allEntries.push(...entries);
  }

  // Score every entry against the query vector
  const scored = allEntries.map((entry) => ({
    ...entry,
    similarity: cosineSimilarity(queryVector, entry.vector),
  }));

  // Filter by threshold, sort by similarity descending, take topK
  return scored
    .filter((e) => e.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// ── Find near-duplicate rows within a single file ────────────────────────────
// Groups rows that are semantically similar above the threshold.
// Returns only groups with 2+ members (actual duplicates).

export async function findNearDuplicates(
  fileId: string,
  threshold = 0.85
): Promise<Array<{
  group: number;
  rows: Array<{ rowIndex: number; text: string; similarity: number }>;
}>> {
  const root        = await navigator.storage.getDirectory();
  const dir         = await root.getDirectoryHandle("tokenlift");
  const datasetsDir = await dir.getDirectoryHandle("datasets");

  const vectorHandle = await datasetsDir.getFileHandle(`${fileId}.vectors.json`);
  const file         = await vectorHandle.getFile();
  const entries: VectorEntry[] = JSON.parse(await file.text());

  const { cosineSimilarity } = await import("./embeddings");

  // Single-pass greedy clustering
  // Each entry joins the first group whose seed is similar enough
  const groups: number[] = new Array(entries.length).fill(-1);
  let groupCount = 0;

  for (let i = 0; i < entries.length; i++) {
    if (groups[i] !== -1) continue; // already assigned

    groups[i] = groupCount; // seed a new group

    for (let j = i + 1; j < entries.length; j++) {
      if (groups[j] !== -1) continue;
      const sim = cosineSimilarity(entries[i].vector, entries[j].vector);
      if (sim >= threshold) {
        groups[j] = groupCount;
      }
    }

    groupCount++;
  }

  // Collect entries by group
  const groupMap = new Map<number, VectorEntry[]>();
  entries.forEach((entry, i) => {
    const g = groups[i];
    if (!groupMap.has(g)) groupMap.set(g, []);
    groupMap.get(g)!.push(entry);
  });

  // Return only groups with 2+ members
  return Array.from(groupMap.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([group, rows]) => ({
      group,
      rows: rows.map((r) => ({
        rowIndex:   r.rowIndex,
        text:       r.text,
        similarity: 1.0, // seed-to-member similarity stored as 1.0
      })),
    }));
}

// ── Check if a file has been indexed ─────────────────────────────────────────

export async function hasVectors(fileId: string): Promise<boolean> {
  try {
    const root        = await navigator.storage.getDirectory();
    const dir         = await root.getDirectoryHandle("tokenlift");
    const datasetsDir = await dir.getDirectoryHandle("datasets");
    await datasetsDir.getFileHandle(`${fileId}.vectors.json`);
    return true;
  } catch {
    return false;
  }
}

// ── Delete vector index for a file ───────────────────────────────────────────

export async function deleteVectors(fileId: string): Promise<void> {
  try {
    const root        = await navigator.storage.getDirectory();
    const dir         = await root.getDirectoryHandle("tokenlift");
    const datasetsDir = await dir.getDirectoryHandle("datasets");
    await datasetsDir.removeEntry(`${fileId}.vectors.json`);
  } catch {
    // File may not exist — silent fail
  }
}
