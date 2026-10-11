import { NextRequest, NextResponse } from "next/server";
import { userFromToken, tokenFrom, can } from "./auth";
import type { Actor } from "./audit";
import type { Permission } from "./perms";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

// ---- tiny in-memory rate limiter (per process) ----
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return;
  }
  b.n++;
  if (b.n > max) throw new HttpError(429, "Too many requests. Please slow down and try again shortly.");
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message, ...(e.data ?? {}) }, { status: e.status });
  console.error("[api error]", e);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

interface Ctx {
  req: NextRequest;
  actor: Actor;
  params: Record<string, string>;
}

/** Authenticated + permission-checked + rate-limited route wrapper. */
export function route(perm: Permission | null, fn: (c: Ctx) => Promise<unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: NextRequest, context: { params: Promise<any> }) => {
    try {
      const actor = await userFromToken(tokenFrom(req));
      if (!actor) throw new HttpError(401, "Not authenticated");
      actor.ip = clientIp(req);
      actor.ua = req.headers.get("user-agent") ?? undefined;
      rateLimit(`api:${actor.id}`, 600, 60_000);
      if (perm && !(await can(actor.role, perm))) throw new HttpError(403, "You do not have permission to do this.");
      const params = (await context?.params) ?? {};
      const out = await fn({ req, actor, params });
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
export const intParam = (v: string | null | undefined): number | undefined => {
  const n = Number(v);
  return v && Number.isInteger(n) ? n : undefined;
};
