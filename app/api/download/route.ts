import { NextRequest, NextResponse } from "next/server";

// Downloads served from GitHub Releases — free, no env vars needed.
// Repo: https://github.com/gortysriram94/ai-cursor
//
// To publish a release:
//   gh release create v0.1.0 \
//     dist/AIcursor-windows-setup.exe \
//     dist/AIcursor-macos-v0.1.dmg \
//     --title "AI Cursor v0.1.0" --latest

const REPO = "gortysriram94/ai-cursor";
const BASE = `https://github.com/${REPO}/releases/latest/download`;

// GitHub Actions names files AIcursor-windows-vX.X.X.zip / AIcursor-macos-vX.X.X.dmg
// "latest" release always has the newest — filenames are fixed per release tag.
const VERSION  = "v0.1.0";
const WIN_URL  = `${BASE}/AIcursor-windows-${VERSION}.zip`;
const MAC_URL  = `${BASE}/AIcursor-macos-${VERSION}.dmg`;

function detectPlatform(ua: string): "windows" | "macos" {
  return /mac os|macintosh/i.test(ua) ? "macos" : "windows";
}

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform")
    ?? detectPlatform(req.headers.get("user-agent") ?? "");

  const url = platform === "macos" ? MAC_URL : WIN_URL;
  return NextResponse.redirect(url, { status: 302 });
}
