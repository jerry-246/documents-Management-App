import bcrypt from "bcryptjs";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { HttpError, readJson, route, str } from "@/lib/api";
import { can } from "@/lib/auth";
import { ROLES } from "@/lib/perms";

export const dynamic = "force-dynamic";

export const GET = route(null, async ({ req, actor }) => {
  // ?options=1 → lightweight list for filter dropdowns (any signed-in user)
  if (req.nextUrl.searchParams.get("options") === "1") {
    const rows = await db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name));
    return { rows };
  }
  if (!(await can(actor.role, "users.manage"))) throw new HttpError(403, "You do not have permission to do this.");
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, position: users.position, role: users.role, status: users.status, createdAt: users.createdAt })
    .from(users)
    .orderBy(asc(users.name));
  return { rows };
});

export const POST = route("users.manage", async ({ req, actor }) => {
  const b = await readJson(req);
  const name = str(b.name);
  const email = str(b.email).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  const role = str(b.role) || "staff";
  const position = str(b.position).slice(0, 120);
  if (!position) throw new HttpError(400, "Position is required (e.g. Clearing Officer, Accountant).");
  if (!name) throw new HttpError(400, "Name is required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "A valid email is required.");
  if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
  if (!(ROLES as string[]).includes(role)) throw new HttpError(400, "Invalid role.");
  const [dup] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (dup) throw new HttpError(409, "A user with this email already exists.");
  const [u] = await db.insert(users).values({ name, email, position, role, passwordHash: bcrypt.hashSync(password, 10) }).returning({ id: users.id });
  await audit(db, { actor, action: "user_created", newValue: { name, email, position, role }, recordId: null });
  return { id: u.id };
});
