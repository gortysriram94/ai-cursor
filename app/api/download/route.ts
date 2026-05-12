import { NextRequest, NextResponse } from "next/server";

// Downloads served from GitHub Releases — free, no env vars needed.
// Windows: installer .exe (preferred) with .zip fallback.
// macOS:   DMG with .zip fallback.
// Repo: https://github.com/gortysriram94/ai-cursor

const REPO = "gortysriram94/ai-cursor";
const BASE = `https://github.com/${REPO}/releases/latest/download`;

async function resolveUrl(preferred: string, fallback: string): Promise<string> {
  try {
    const res = await fetch(preferred, { method: "HEAD", redirect: "follow" });
    if (res.ok) return preferred;
  } catch {}
  return fallback;
}

function detectPlatform(ua: string): "windows" | "macos" {
  return /mac os|macintosh/i.test(ua) ? "macos" : "windows";
}

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform")
    ?? detectPlatform(req.headers.get("user-agent") ?? "");

  let url: string;
  if (platform === "macos") {
    url = await resolveUrl(`${BASE}/AIcursor-macos.dmg`, `${BASE}/AIcursor-macos.zip`);
  } else {
    url = await resolveUrl(`${BASE}/AIcursor-windows-setup.exe`, `${BASE}/AIcursor-windows-setup.zip`);
  }

  return NextResponse.redirect(url, { status: 302 });
}
