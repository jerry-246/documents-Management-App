import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/api";
import { COOKIE, cookieOptions, isSecureRequest, tokenFrom, userFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const u = await userFromToken(tokenFrom(req));
  if (u) await audit(db, { actor: { id: u.id, name: u.name, ip: clientIp(req) }, action: "logout" });
  const res = NextResponse.json({ ok: true });
  const secure = isSecureRequest(req.headers, req.nextUrl.protocol, req.nextUrl.host);
  res.cookies.set(COOKIE, "", { ...cookieOptions(secure), maxAge: 0 });
  return res;
}
