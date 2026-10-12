import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { clientIp, errorResponse, HttpError, rateLimit, readJson, str } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Step 2 of "forgot password": verify the security answer and set a new password. */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    rateLimit(`reset:${ip}`, 10, 15 * 60_000);
    const b = await readJson(req);
    const email = str(b.email).toLowerCase();
    const answer = typeof b.answer === "string" ? b.answer.trim() : "";
    const newPassword = typeof b.newPassword === "string" ? b.newPassword : "";
    if (!email || !answer) throw new HttpError(400, "Email and your security answer are required.");
    if (newPassword.length < 8) throw new HttpError(400, "New password must be at least 8 characters.");
    const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    const ok = !!u && u.status === "active" && !!u.securityAnswerHash && bcrypt.compareSync(answer.toLowerCase(), u.securityAnswerHash);
    if (!ok) {
      await audit(db, { actor: { id: 0, name: email || "unknown", ip }, action: "password_reset_failed", newValue: email });
      throw new HttpError(400, "That answer does not match our records.");
    }
    await db.update(users).set({ passwordHash: bcrypt.hashSync(newPassword, 10), updatedAt: new Date() }).where(sql`${users.id} = ${u.id}`);
    await audit(db, { actor: { id: u.id, name: u.name, ip }, action: "user_password_reset", newValue: `${u.email} (self-service)` });
    const res = NextResponse.json({ ok: true });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
