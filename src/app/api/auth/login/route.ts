import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { clientIp, errorResponse, HttpError, rateLimit, readJson, str } from "@/lib/api";
import { COOKIE, cookieOptions, createSessionToken, isSecureRequest } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    rateLimit(`login:${ip}`, 20, 15 * 60_000);
    await ensureSeed();
    const b = await readJson(req);
    const email = str(b.email).toLowerCase();
    const password = typeof b.password === "string" ? b.password : "";
    const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    const ok = !!u && u.status === "active" && bcrypt.compareSync(password, u.passwordHash);
    if (!ok) {
      await audit(db, { actor: { id: 0, name: email || "unknown", ip }, action: "login_failed", newValue: email });
      throw new HttpError(401, "Invalid email or password.");
    }
    await audit(db, { actor: { id: u.id, name: u.name, ip }, action: "login" });
    const token = await createSessionToken(u.id);
    // token is also returned so the browser can fall back to an Authorization header when cookies are blocked
    const res = NextResponse.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role }, token });
    res.headers.set("Cache-Control", "no-store");
    const secure = isSecureRequest(req.headers, req.nextUrl.protocol, req.nextUrl.host);
    res.cookies.set(COOKIE, token, cookieOptions(secure));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
