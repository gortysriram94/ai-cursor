import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

const TOKEN_FILE = join(process.cwd(), ".puter-token");

export async function POST(req: NextRequest) {
  const { token } = await req.json() as { token: string };
  if (!token?.trim()) {
    return NextResponse.json({ ok: false, error: "No token" }, { status: 400 });
  }

  // Cache in memory for the current process
  process.env.PUTER_AUTH_TOKEN = token.trim();

  // Persist to file so it survives server restarts
  try {
    writeFileSync(TOKEN_FILE, token.trim(), "utf8");
  } catch (e) {
    console.warn("[puter-token] Could not write token file:", e);
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  // Check if a token is currently stored
  const mem = process.env.PUTER_AUTH_TOKEN;
  if (mem) return NextResponse.json({ registered: true });

  try {
    const file = readFileSync(TOKEN_FILE, "utf8").trim();
    if (file) {
      process.env.PUTER_AUTH_TOKEN = file; // warm the cache
      return NextResponse.json({ registered: true });
    }
  } catch { /* no file yet */ }

  return NextResponse.json({ registered: false });
}
