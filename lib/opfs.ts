// lib/opfs.ts
// Origin Private File System — stores cleaned datasets on the user's computer.
// Data never leaves their machine. No server. No Supabase.
// OPFS is sandboxed per origin — only tokenlift.app can read this data.

export interface SavedFile {
  id: string;
  fileName: string;
  savedAt: number;
  originalRows: number;
  cleanedRows: number;
  tokenCount: number;
  vertical: string;
  headers: string[];
  sizeBytes: number;
  hasEmbeddings: boolean;
}

// ── Root directory handle ─────────────────────────────────────────────────────

export async function getOPFSRoot(): Promise<FileSystemDirectoryHandle> {
  return await navigator.storage.getDirectory();
}

// ── Save a cleaned dataset + metadata ────────────────────────────────────────

export async function saveCleanedDataset(
  id: string,
  csvData: string,
  metadata: SavedFile
): Promise<void> {
  const root        = await getOPFSRoot();
  const dir         = await root.getDirectoryHandle("tokenlift", { create: true });
  const datasetsDir = await dir.getDirectoryHandle("datasets",  { create: true });

  // Save CSV data
  const fileHandle = await datasetsDir.getFileHandle(`${id}.csv`, { create: true });
  const writable   = await fileHandle.createWritable();
  await writable.write(csvData);
  await writable.close();

  // Save metadata alongside
  const metaHandle   = await datasetsDir.getFileHandle(`${id}.meta.json`, { create: true });
  const metaWritable = await metaHandle.createWritable();
  await metaWritable.write(JSON.stringify(metadata));
  await metaWritable.close();
}

// ── List all saved files (newest first) ──────────────────────────────────────

export async function listSavedFiles(): Promise<SavedFile[]> {
  try {
    const root        = await getOPFSRoot();
    const dir         = await root.getDirectoryHandle("tokenlift");
    const datasetsDir = await dir.getDirectoryHandle("datasets");

    const files: SavedFile[] = [];

    for await (const [name, handle] of (datasetsDir as any).entries()) {
      if (!name.endsWith(".meta.json")) continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      const text = await file.text();
      try {
        files.push(JSON.parse(text) as SavedFile);
      } catch {
        // Skip malformed metadata
      }
    }

    return files.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

// ── Read CSV content for a saved dataset ─────────────────────────────────────

export async function getDatasetContent(id: string): Promise<string | null> {
  try {
    const root        = await getOPFSRoot();
    const dir         = await root.getDirectoryHandle("tokenlift");
    const datasetsDir = await dir.getDirectoryHandle("datasets");
    const fileHandle  = await datasetsDir.getFileHandle(`${id}.csv`);
    const file        = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

// ── Delete a dataset (CSV + metadata + vectors if present) ───────────────────

export async function deleteDataset(id: string): Promise<void> {
  const root        = await getOPFSRoot();
  const dir         = await root.getDirectoryHandle("tokenlift");
  const datasetsDir = await dir.getDirectoryHandle("datasets");

  await datasetsDir.removeEntry(`${id}.csv`);
  await datasetsDir.removeEntry(`${id}.meta.json`);
  await datasetsDir.removeEntry(`${id}.vectors.json`).catch(() => {});
}

// ── Storage usage estimate ────────────────────────────────────────────────────

export async function getStorageUsage(): Promise<{
  used: number;
  available: number;
  percentage: number;
}> {
  const estimate = await navigator.storage.estimate();
  const used     = estimate.usage  || 0;
  const quota    = estimate.quota  || 0;

  return {
    used,
    available:  quota - used,
    percentage: quota > 0 ? Math.round((used / quota) * 100) : 0,
  };
}

// ── Format bytes to human-readable string ────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0)           return "0 B";
  if (bytes < 1024)          return `${bytes} B`;
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)     return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return                            `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// ── Wipe all TokenLift data from OPFS ────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  const root = await getOPFSRoot();
  try {
    await root.removeEntry("tokenlift", { recursive: true });
  } catch {
    // Folder may not exist — silent fail is correct
  }
}

// ── Check if OPFS is supported in this browser ───────────────────────────────

export function isOPFSSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage !== "undefined" &&
    typeof navigator.storage.getDirectory === "function"
  );
}
