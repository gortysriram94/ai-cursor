import { NextResponse } from "next/server";
import { head } from "@vercel/blob";

const BLOB_KEY = "pushpa/affiliates.json";

export async function GET() {
  try {
    const blob = await head(BLOB_KEY);
    const res  = await fetch(blob.url, { next: { revalidate: 300 } });
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}
