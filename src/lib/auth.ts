import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionSecret, effectivePermissionsForUser } from "./settings";
import type { Actor } from "./audit";
import type { Permission, Role } from "./perms";

export const COOKIE = "cts_session";
const MAX_AGE = 60 * 60 * 12;

let secretCache: Uint8Array | null = null;
async function secret(): Promise<Uint8Array> {
  if (secretCache) return secretCache;
  secretCache = new TextEncoder().encode(await getSessionSecret());
  return secretCache;
}

export async function createSessionToken(uid: number): Promise<string> {
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(await secret());
}

/**
 * Over HTTPS (production, or an embedded preview) the cookie is SameSite=None + Secure + Partitioned
 * so it still works when the app is shown inside an iframe. On plain http://localhost it falls back to Lax.
 */
export const cookieOptions = (secure: boolean) => ({
  httpOnly: true,
  sameSite: (secure ? "none" : "lax") as "none" | "lax",
  secure,
  partitioned: secure,
  path: "/",
  maxAge: MAX_AGE,
});

export function isSecureRequest(headers: Headers, protocol: string, host: string): boolean {
  const proto = (headers.get("x-forwarded-proto") ?? protocol.replace(":", "")).split(",")[0].trim();
  if (proto === "https") return true;
  const h = (headers.get("x-forwarded-host") ?? headers.get("host") ?? host).split(":")[0];
  return !(h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" || h === "");
}

export async function userFromToken(token: string | undefined): Promise<Actor | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await secret());
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(payload.uid)))
      .limit(1);
    if (!u || u.status !== "active") return null;
    const permissions = await effectivePermissionsForUser({ role: u.role as Role, permissions: u.permissions });
    return { id: u.id, name: u.name, email: u.email, role: u.role as Role, position: u.position, permissions };
  } catch {
    return null;
  }
}

/** Session token from the cookie, or (fallback for browsers that block cookies in embedded previews) the Authorization header. */
export function tokenFrom(req: { cookies: { get(n: string): { value: string } | undefined }; headers: Headers }): string | undefined {
  const c = req.cookies.get(COOKIE)?.value;
  if (c) return c;
  const h = req.headers.get("authorization");
  return h && /^Bearer\s+/i.test(h) ? h.replace(/^Bearer\s+/i, "").trim() : undefined;
}

/** For server components / layouts. */
export async function getSessionUser(): Promise<Actor | null> {
  const jar = await cookies();
  return userFromToken(jar.get(COOKIE)?.value);
}

/** True when the signed-in user (with their per-user permission overrides) holds the permission. */
export function can(actor: Actor, perm: Permission): boolean {
  return !!actor.permissions?.includes(perm);
}
