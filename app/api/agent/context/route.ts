// POST: Electron agent pushes detected login services after boot
// GET:  UI fetches to personalise command-palette suggestions
// Single-user desktop app — module-level cache is intentional.

import { NextResponse } from "next/server";

interface AgentContext {
  services: string[];
  updatedAt: number;
}

let _ctx: AgentContext = { services: [], updatedAt: 0 };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const services: string[] = Array.isArray(body.services) ? body.services : [];
    _ctx = { services, updatedAt: Date.now() };
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json(_ctx);
}
