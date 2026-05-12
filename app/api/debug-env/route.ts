import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Return ONLY the NAMES of env vars (not values, for security)
  const envKeys = Object.keys(process.env).filter(k => 
    k.includes("NVIDIA") || k.includes("API") || k.includes("ANTHROPIC")
  );
  
  const envInfo: Record<string, number> = {};
  for (const key of envKeys) {
    envInfo[key] = process.env[key]?.length ?? 0;
  }
  
  return NextResponse.json({
    cwd: process.cwd(),
    envVars: envInfo,
    nodeEnv: process.env.NODE_ENV,
  });
}
