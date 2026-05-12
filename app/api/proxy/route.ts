// app/api/proxy/route.ts
// Header-stripping proxy — removes X-Frame-Options and CSP so sites load in iframes.
// Does NOT rewrite HTML. The browser fetches the real site with real cookies.
// This is the simplest possible proxy — just a header stripper + forwarder.

import { NextRequest } from 'next/server';

const BLOCKED_HOSTS_V4 = /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/i;
const BLOCKED_HOSTS_V6 = /^\[?(::1$|::ffff:|fd[0-9a-f]{2,}:|fe80:)/i;

function isPrivateHost(hostname: string): boolean {
  return BLOCKED_HOSTS_V4.test(hostname) || BLOCKED_HOSTS_V6.test(hostname);
}

// Headers that block iframe embedding — strip these, pass everything else through
const STRIP = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'cross-origin-embedder-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
]);

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) return new Response('Missing url', { status: 400 });

  let target: URL;
  try { target = new URL(decodeURIComponent(raw)); }
  catch { return new Response('Invalid URL', { status: 400 }); }

  if (!['http:', 'https:'].includes(target.protocol))
    return new Response('Only http/https', { status: 400 });

  if (isPrivateHost(target.hostname))
    return new Response('Private IP blocked', { status: 403 });

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        // Forward the real browser headers so sites think it's a normal request
        'User-Agent':      req.headers.get('user-agent') ?? 'Mozilla/5.0 Chrome/122.0',
        'Accept':          req.headers.get('accept') ?? 'text/html,*/*',
        'Accept-Language': req.headers.get('accept-language') ?? 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity', // avoid compressed responses
        'Cache-Control':   'no-cache',
        // Forward cookies if present (won't have user's real cookies server-side,
        // but handles any cookies set by the proxy session itself)
        ...(req.headers.get('cookie') ? { 'Cookie': req.headers.get('cookie')! } : {}),
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    // Build response headers — strip blocking ones, keep everything else
    const respHeaders = new Headers();
    upstream.headers.forEach((val, key) => {
      if (!STRIP.has(key.toLowerCase())) {
        respHeaders.set(key, val);
      }
    });

    // Add permissive headers so iframe can load it
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
    respHeaders.set('Cross-Origin-Embedder-Policy', 'unsafe-none');
    respHeaders.set('Cross-Origin-Opener-Policy', 'unsafe-none');
    // Remove content-encoding to avoid decompression issues
    respHeaders.delete('content-encoding');
    respHeaders.delete('content-length');

    return new Response(upstream.body, {
      status:  upstream.status,
      headers: respHeaders,
    });

  } catch (err: any) {
    const isTimeout = err?.message?.includes('timeout') || err?.name === 'TimeoutError';
    return new Response(isTimeout ? 'Request timed out' : 'Failed to fetch', { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  // Forward POST requests too (for forms, API calls from proxied pages)
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) return new Response('Missing url', { status: 400 });

  let target: URL;
  try { target = new URL(decodeURIComponent(raw)); }
  catch { return new Response('Invalid URL', { status: 400 }); }

  if (isPrivateHost(target.hostname))
    return new Response('Private IP blocked', { status: 403 });

  try {
    const body = await req.arrayBuffer();
    const upstream = await fetch(target.toString(), {
      method: 'POST',
      headers: {
        'Content-Type':    req.headers.get('content-type') ?? 'application/json',
        'User-Agent':      req.headers.get('user-agent') ?? 'Mozilla/5.0 Chrome/122.0',
        'Accept':          req.headers.get('accept') ?? '*/*',
        'Accept-Encoding': 'identity',
        ...(req.headers.get('cookie') ? { 'Cookie': req.headers.get('cookie')! } : {}),
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    const respHeaders = new Headers();
    upstream.headers.forEach((val, key) => {
      if (!STRIP.has(key.toLowerCase())) respHeaders.set(key, val);
    });
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.delete('content-encoding');
    respHeaders.delete('content-length');

    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });

  } catch (err: any) {
    return new Response('Failed', { status: 502 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cookie',
    },
  });
}