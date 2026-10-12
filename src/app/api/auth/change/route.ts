import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { clientIp, errorResponse, HttpError, rateLimit, readJson, str } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Logged-out password change on the login screen: proves identity with the current password, sets a new
 * one, and optionally registers a security question + answer for future self-service resets.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    rateLimit(`change:${ip}`, 10, 15 * 60_000);
    const b = await readJson(req);
    const email = str(b.email).toLowerCase();
    const currentPassword = typeof b.currentPassword === "string" ? b.currentPassword : "";
    const newPassword = typeof b.newPassword === "string" ? b.newPassword : "";
    const question = str(b.securityQuestion).slice(0, 200);
    const answer = typeof b.securityAnswer === "string" ? b.securityAnswer.trim() : "";
    if (!email) throw new HttpError(400, "Email is required.");
    if (newPassword.length < 8) throw new HttpError(400, "New password must be at least 8 characters.");
    const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    if (!u || u.status !== "active" || !bcrypt.compareSync(currentPassword, u.passwordHash)) {
      await audit(db, { actor: { id: 0, name: email || "unknown", ip }, action: "password_change_failed", newValue: email });
      throw new HttpError(401, "Your current password is incorrect.");
    }
    const patch: Partial<typeof users.$inferInsert> = { passwordHash: bcrypt.hashSync(newPassword, 10), updatedAt: new Date() };
    if (question) {
      patch.securityQuestion = question;
      patch.securityAnswerHash = answer ? bcrypt.hashSync(answer.toLowerCase(), 10) : null;
    }
    await db.update(users).set(patch).where(sql`${users.id} = ${u.id}`);
    await audit(db, { actor: { id: u.id, name: u.name, ip }, action: "user_password_reset", newValue: `${u.email} (self-service)` });
    if (question) await audit(db, { actor: { id: u.id, name: u.name, ip }, action: "user_security_question_change", fieldName: u.email });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
