import { NextRequest, NextResponse } from "next/server";

// Downloads served from GitHub Releases — free, no env vars needed.
// Fixed filenames so the URL never changes between versions.
// Repo: https://github.com/gortysriram94/ai-cursor

const REPO = "gortysriram94/ai-cursor";
const BASE = `https://github.com/${REPO}/releases/latest/download`;

const WIN_URL = `${BASE}/AIcursor-windows-setup.exe`;
const MAC_URL = `${BASE}/AIcursor-macos.dmg`;

function detectPlatform(ua: string): "windows" | "macos" {
  return /mac os|macintosh/i.test(ua) ? "macos" : "windows";
}

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform")
    ?? detectPlatform(req.headers.get("user-agent") ?? "");

  const url = platform === "macos" ? MAC_URL : WIN_URL;
  return NextResponse.redirect(url, { status: 302 });
}
