import { NextRequest, NextResponse } from "next/server";

const REPO = "gortysriram94/ai-cursor";
const FALLBACK_BASE = `https://github.com/${REPO}/releases/latest/download`;

async function getLatestAssets(): Promise<{ name: string; url: string }[]> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers, next: { revalidate: 300 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.assets ?? []).map((a: { name: string; browser_download_url: string }) => ({
      name: a.name,
      url: a.browser_download_url,
    }));
  } catch {
    return [];
  }
}

function detectPlatform(ua: string): "windows" | "macos" {
  return /mac os|macintosh/i.test(ua) ? "macos" : "windows";
}

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform")
    ?? detectPlatform(req.headers.get("user-agent") ?? "");

  const assets = await getLatestAssets();

  let url: string;

  if (platform === "macos") {
    const asset = assets.find(a => a.name.endsWith(".dmg"))
               ?? assets.find(a => a.name.toLowerCase().includes("mac") && a.name.endsWith(".zip"));
    url = asset?.url ?? `${FALLBACK_BASE}/AIcursor-macos.dmg`;
  } else {
    const asset = assets.find(a => a.name.endsWith(".exe"))
               ?? assets.find(a => a.name.toLowerCase().includes("windows") && a.name.endsWith(".zip"));
    url = asset?.url ?? `${FALLBACK_BASE}/AIcursor-windows-setup.exe`;
  }

  return NextResponse.redirect(url, { status: 302 });
}
