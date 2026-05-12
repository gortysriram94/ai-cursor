// app/api/browser-fetch/route.ts
// Server-side fetcher for the custom React browser renderer.
// For HTML: returns JSON { html, url, status } so DOMParser can process it client-side.
// For assets (CSS, JS, images, fonts): passes through with CORS headers.

import { NextRequest, NextResponse } from "next/server";

const STRIP_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "permissions-policy",
]);

const BLOCKED_HOSTS_V4 = /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/i;
const BLOCKED_HOSTS_V6 = /^\[?(::1$|::ffff:|fd[0-9a-f]{2,}:|fe80:)/i;

function isPrivateHost(hostname: string): boolean {
  return BLOCKED_HOSTS_V4.test(hostname) || BLOCKED_HOSTS_V6.test(hostname);
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) return new NextResponse("Missing url", { status: 400 });

  // Optional referer — sent when the proxied asset was linked from a known page
  const referer = req.nextUrl.searchParams.get("ref") ?? "";

  let target: URL;
  try { target = new URL(decodeURIComponent(rawUrl)); }
  catch { return new NextResponse("Invalid URL", { status: 400 }); }

  if (!["http:", "https:"].includes(target.protocol))
    return new NextResponse("Only http/https", { status: 400 });

  if (isPrivateHost(target.hostname))
    return new NextResponse("Private addresses blocked", { status: 403 });

  try {
    const upstreamHeaders: Record<string, string> = {
      "User-Agent":      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "identity",
      "Cache-Control":   "no-cache",
    };
    // Referer helps CDNs that enforce hotlink protection (most image CDNs check this)
    if (referer) upstreamHeaders["Referer"] = referer;
    else upstreamHeaders["Referer"] = `${target.protocol}//${target.hostname}/`;

    const upstream = await fetch(target.toString(), {
      headers: upstreamHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    const contentType = upstream.headers.get("content-type") ?? "";
    const isHtml = contentType.includes("text/html");
    const isCss  = contentType.includes("text/css");

    // ── CSS: rewrite url() so background images load through the proxy ────────
    if (isCss) {
      const cssText = await upstream.text();
      const rewritten = cssText.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (match, u) => {
        const trimmed = u.trim();
        if (/^(data:|#|about:)/i.test(trimmed)) return match;
        try {
          const abs = new URL(trimmed, target.toString()).href;
          if (abs.startsWith("http")) {
            return `url("/api/browser-fetch?url=${encodeURIComponent(abs)}&ref=${encodeURIComponent(target.toString())}")`;
          }
        } catch { /* leave as-is */ }
        return match;
      });
      const h = new Headers();
      h.set("Content-Type", "text/css; charset=utf-8");
      h.set("Access-Control-Allow-Origin", "*");
      h.set("Cache-Control", "public, max-age=300");
      return new NextResponse(rewritten, { status: upstream.status, headers: h });
    }

    // ── Non-HTML assets: images, JS, fonts, video — stream through ───────────
    if (!isHtml) {
      const headers = new Headers();
      upstream.headers.forEach((v, k) => {
        if (!STRIP_HEADERS.has(k.toLowerCase())) headers.set(k, v);
      });
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Cross-Origin-Resource-Policy", "cross-origin");
      headers.set("Cache-Control", "public, max-age=300");
      headers.delete("content-encoding");
      headers.delete("content-length");
      return new NextResponse(upstream.body, { status: upstream.status, headers });
    }

    // ── HTML pages: return raw HTML as JSON for DOMParser ────────────────────
    // The client uses DOMParser to parse this into a real DOM tree,
    // then nodeToReact() converts it to React elements.
    // We do NOT rewrite the HTML here — the client handles URL resolution.
    const html = await upstream.text();

    return NextResponse.json(
      {
        html,
        url:         upstream.url || target.toString(),
        status:      upstream.status,
        contentType,
      },
      {
        headers: {
          "Cache-Control":               "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Fetch failed";
    return new NextResponse(msg, { status: 502 });
  }
}