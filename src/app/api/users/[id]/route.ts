import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { HttpError, readJson, route, str } from "@/lib/api";
import { ROLES, normalizePermissions } from "@/lib/perms";

export const dynamic = "force-dynamic";

export const PATCH = route("users.manage", async ({ req, actor, params }) => {
  const id = Number(params.id);
  const b = await readJson(req);
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) throw new HttpError(404, "User not found");
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (b.name !== undefined) {
    if (!str(b.name)) throw new HttpError(400, "Name is required.");
    patch.name = str(b.name);
  }
  if (b.position !== undefined) {
    if (!str(b.position)) throw new HttpError(400, "Position is required.");
    patch.position = str(b.position).slice(0, 120);
  }
  if (b.role !== undefined) {
    if (!(ROLES as string[]).includes(str(b.role))) throw new HttpError(400, "Invalid role.");
    patch.role = str(b.role);
  }
  if (b.status !== undefined) {
    if (!["active", "disabled"].includes(str(b.status))) throw new HttpError(400, "Invalid status.");
    patch.status = str(b.status);
  }
  if (typeof b.password === "string" && b.password) {
    if (b.password.length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
    patch.passwordHash = bcrypt.hashSync(b.password, 10);
  }

  // Per-user permission overrides (administrators always keep full rights → stored as null).
  const nextRole = (patch.role ?? u.role) as string;
  if (b.permissions !== undefined) {
    patch.permissions = nextRole === "admin" || b.permissions === null ? null : normalizePermissions(b.permissions);
  }
  // Security question / answer for self-service password reset.
  if (b.securityQuestion !== undefined) {
    const q = str(b.securityQuestion).slice(0, 200);
    patch.securityQuestion = q || null;
    if (!q) patch.securityAnswerHash = null;
  }
  if (typeof b.securityAnswer === "string" && b.securityAnswer.trim()) {
    const q = (patch.securityQuestion ?? u.securityQuestion) || "";
    if (!q) throw new HttpError(400, "A security question is required before setting an answer.");
    patch.securityAnswerHash = bcrypt.hashSync(b.securityAnswer.trim().toLowerCase(), 10);
  }

  const losesAdmin = u.role === "admin" && ((patch.role && patch.role !== "admin") || patch.status === "disabled");
  if (losesAdmin) {
    if (u.id === actor.id) throw new HttpError(400, "You cannot remove your own administrator access.");
    const others = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active"), ne(users.id, id)));
    if (!others.length) throw new HttpError(400, "There must be at least one active administrator.");
  }
  await db.update(users).set(patch).where(eq(users.id, id));
  if (patch.role && patch.role !== u.role)
    await audit(db, { actor, action: "user_permission_change", fieldName: "Role", oldValue: `${u.email}: ${u.role}`, newValue: `${u.email}: ${patch.role}` });
  if (patch.status && patch.status !== u.status)
    await audit(db, { actor, action: "user_status_change", fieldName: "Status", oldValue: `${u.email}: ${u.status}`, newValue: `${u.email}: ${patch.status}` });
  if (patch.name && patch.name !== u.name)
    await audit(db, { actor, action: "user_details_change", fieldName: "Name", oldValue: u.name, newValue: patch.name });
  if (patch.position !== undefined && patch.position !== (u.position ?? ""))
    await audit(db, { actor, action: "user_details_change", fieldName: `Position (${u.email})`, oldValue: u.position ?? "", newValue: patch.position });
  if (b.permissions !== undefined && JSON.stringify(patch.permissions ?? null) !== JSON.stringify(u.permissions ?? null))
    await audit(db, { actor, action: "user_permission_change", fieldName: `Permissions (${u.email})`, oldValue: u.permissions ?? "role default", newValue: patch.permissions ?? "role default" });
  if (b.securityQuestion !== undefined || b.securityAnswer !== undefined)
    await audit(db, { actor, action: "user_security_question_change", fieldName: u.email });
  if (patch.passwordHash) await audit(db, { actor, action: "user_password_reset", newValue: u.email });
  return { ok: true };
});
