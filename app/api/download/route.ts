import { NextRequest, NextResponse } from "next/server";

const REPO = "gortysriram94/ai-cursor";

async function getLatestAssets(): Promise<{ name: string; url: string }[]> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    { headers: { Accept: "application/vnd.github+json" }, next: { revalidate: 300 } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.assets ?? []).map((a: { name: string; browser_download_url: string }) => ({
    name: a.name,
    url: a.browser_download_url,
  }));
}

function detectPlatform(ua: string): "windows" | "macos" {
  return /mac os|macintosh/i.test(ua) ? "macos" : "windows";
}

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform")
    ?? detectPlatform(req.headers.get("user-agent") ?? "");

  const assets = await getLatestAssets();

  let asset: { url: string } | undefined;

  if (platform === "macos") {
    asset = assets.find(a => a.name.endsWith(".dmg"))
         ?? assets.find(a => a.name.toLowerCase().includes("mac") && a.name.endsWith(".zip"));
  } else {
    asset = assets.find(a => a.name.endsWith(".exe"))
         ?? assets.find(a => a.name.toLowerCase().includes("windows") && a.name.endsWith(".zip"));
  }

  if (!asset) {
    return NextResponse.json({ error: "No release found" }, { status: 404 });
  }

  return NextResponse.redirect(asset.url, { status: 302 });
}
