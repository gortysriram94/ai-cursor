import { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.ADMIN_SECRET ?? "change-me-in-env"
);
const COOKIE = "pushpa_admin";

export async function verifyAdmin(req: NextRequest): Promise<boolean> {
  try {
    const token = req.cookies.get(COOKIE)?.value;
    if (!token) return false;
    await jwtVerify(token, SECRET);
    return true;
  } catch {
    return false;
  }
}
