import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const results: Record<string, any> = {};

  try {
    const r = await fetch('https://example.com', { signal: AbortSignal.timeout(5000) });
    results.network = { ok: r.ok, status: r.status };
  } catch (e: any) {
    results.network = { error: e.message };
  }

  try {
    const r = await fetch('https://en.wikipedia.org/wiki/Main_Page', {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/122.0' },
      signal: AbortSignal.timeout(8000),
    });
    const ct = r.headers.get('content-type') ?? '';
    const text = ct.includes('html') ? (await r.text()).slice(0, 100) : '(non-html)';
    results.wikipedia = { ok: r.ok, status: r.status, preview: text };
  } catch (e: any) {
    results.wikipedia = { error: e.message };
  }

  results.meta = { node: process.version, env: process.env.NODE_ENV };

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } });
}