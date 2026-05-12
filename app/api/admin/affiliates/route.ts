import { NextRequest, NextResponse } from "next/server";
import { put, head } from "@vercel/blob";
import { verifyAdmin } from "../auth";

const BLOB_KEY = "pushpa/affiliates.json";

async function readAffiliates(): Promise<Record<string, string>> {
  try {
    const blob = await head(BLOB_KEY);
    const res  = await fetch(blob.url);
    return await res.json();
  } catch {
    return {};
  }
}

async function writeAffiliates(data: Record<string, string>) {
  await put(BLOB_KEY, JSON.stringify(data, null, 2), {
    access:      "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
}

export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await readAffiliates());
}

export async function PUT(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  if (typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  await writeAffiliates(body);
  return NextResponse.json({ ok: true });
}
