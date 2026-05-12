// app/chat/components/FileUpload.tsx
"use client";

import { useState, useRef } from "react";

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  category: "audio" | "video" | "document" | "spreadsheet" | "image" | "pdf" | "archive" | "other";
  data: string; // base64
  preview?: string;
}

interface FileUploadProps {
  onFilesUploaded: (files: UploadedFile[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

const FILE_CATEGORIES = {
  audio: ["mp3", "wav", "m4a", "aac", "ogg", "flac", "wma"],
  video: ["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv"],
  document: ["doc", "docx", "txt", "rtf", "odt"],
  spreadsheet: ["csv", "xlsx", "xls", "ods", "tsv"],
  image: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"],
  pdf: ["pdf"],
  archive: ["zip", "rar", "7z", "tar", "gz"],
  other: [] as string[],
} as const satisfies Record<string, string[]>;

function getFileCategory(fileName: string): UploadedFile["category"] {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  for (const [category, extensions] of Object.entries(FILE_CATEGORIES)) {
    if ((extensions as string[]).includes(ext)) {
      return category as UploadedFile["category"];
    }
  }
  return "other";
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getCategoryIcon(category: UploadedFile["category"]): string {
  const icons = {
    audio: "🎵",
    video: "🎬",
    document: "📄",
    spreadsheet: "📊",
    image: "🖼️",
    pdf: "📕",
    archive: "📦",
    other: "📎",
  };
  return icons[category];
}

export default function FileUpload({ onFilesUploaded, maxFiles = 10, maxSizeMB = 50 }: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (fileList: FileList) => {
    setError("");
    setUploading(true);

    const newFiles: UploadedFile[] = [];
    const maxSize = maxSizeMB * 1024 * 1024;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];

      // Check size
      if (file.size > maxSize) {
        setError(`${file.name} exceeds ${maxSizeMB}MB limit`);
        continue;
      }

      // Check total files
      if (files.length + newFiles.length >= maxFiles) {
        setError(`Maximum ${maxFiles} files allowed`);
        break;
      }

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]); // Remove data URL prefix
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const uploadedFile: UploadedFile = {
          id: `file_${Date.now()}_${i}`,
          name: file.name,
          size: file.size,
          type: file.type,
          category: getFileCategory(file.name),
          data: base64,
        };

        // Generate preview for images
        if (uploadedFile.category === "image") {
          uploadedFile.preview = `data:${file.type};base64,${base64}`;
        }

        newFiles.push(uploadedFile);
      } catch (err) {
        console.error("File processing error:", err);
        setError(`Failed to process ${file.name}`);
      }
    }

    const allFiles = [...files, ...newFiles];
    setFiles(allFiles);
    onFilesUploaded(allFiles);
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    const newFiles = files.filter(f => f.id !== id);
    setFiles(newFiles);
    onFilesUploaded(newFiles);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Upload Zone */}
      <div
        onDragEnter={() => setDragActive(true)}
        onDragLeave={() => setDragActive(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragActive ? "var(--accent)" : "var(--border)"}`,
          background: dragActive ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "var(--panel)",
          padding: "32px 24px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.3s",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={handleChange}
          style={{ display: "none" }}
          accept="*/*"
        />
        <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
          {uploading ? "Processing files..." : "Drop files here or click to browse"}
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          Audio · Video · PDFs · Spreadsheets · Images · Documents · Archives
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>
          Max {maxFiles} files · {maxSizeMB}MB each
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: "12px 16px",
          background: "color-mix(in srgb, var(--danger) 10%, transparent)",
          border: "1px solid var(--danger)",
          borderRadius: 8,
        }}>
          <div className="mono" style={{ fontSize: 11, color: "var(--danger)" }}>
            ⚠️ {error}
          </div>
        </div>
      )}

      {/* Uploaded Files */}
      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em" }}>
            UPLOADED FILES ({files.length}/{maxFiles})
          </div>
          {files.map((file) => (
            <div
              key={file.id}
              style={{
                padding: "12px 16px",
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 12,
                transition: "all 0.2s",
              }}
            >
              {/* Preview or Icon */}
              {file.preview ? (
                <img
                  src={file.preview}
                  alt={file.name}
                  style={{
                    width: 48,
                    height: 48,
                    objectFit: "cover",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                  }}
                />
              ) : (
                <div style={{
                  width: 48,
                  height: 48,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--surface)",
                  borderRadius: 4,
                  fontSize: 24,
                }}>
                  {getCategoryIcon(file.category)}
                </div>
              )}

              {/* File Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text)",
                  marginBottom: 4,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {file.name}
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                    {formatFileSize(file.size)}
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--accent)" }}>
                    {file.category.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Remove Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(file.id);
                }}
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                  padding: "6px 12px",
                  fontSize: 11,
                  cursor: "pointer",
                  borderRadius: 4,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--danger)";
                  e.currentTarget.style.color = "var(--danger)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.color = "var(--muted)";
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
