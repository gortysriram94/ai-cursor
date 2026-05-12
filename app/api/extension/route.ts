// app/api/extension/route.ts
// Packages the Chrome extension as a downloadable ZIP.
// Uses jszip (already a dependency) to bundle all extension files server-side.

import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import JSZip from "jszip";

const EXT_ROOT = path.join(process.cwd(), "chrome-extension");

// All files to include in the ZIP (relative to chrome-extension/)
const FILES = [
  "manifest.json",
  "config.js",
  "background/service-worker.js",
  "content/content-script.js",
  "content/OverlayManager.js",
  "content/sovereign-scanner.js",
  "ui/popup.html",
  "ui/popup.js",
  "handlers/linkedin.js",
  "handlers/ai-vision-handler.js",
  "handlers/selector-engine.js",
  "rules/strip_frame_headers.json",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

export async function GET(): Promise<Response> {
  try {
    const zip = new JSZip();

    for (const rel of FILES) {
      const abs = path.join(EXT_ROOT, rel);
      if (!existsSync(abs)) {
        console.warn(`[extension] Missing file: ${rel}`);
        continue;
      }
      const data = await readFile(abs);
      zip.file(rel, data);
    }

    const buf = await zip.generateAsync({
      type:               "nodebuffer",
      compression:        "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return new Response(buf.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":        "application/zip",
        "Content-Disposition": 'attachment; filename="tokenlift-extension.zip"',
        "Content-Length":      String(buf.byteLength),
        "Cache-Control":       "no-store",
      },
    });
  } catch (err) {
    console.error("[extension]", err);
    return NextResponse.json({ error: "Failed to package extension" }, { status: 500 });
  }
}
