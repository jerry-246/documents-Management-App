// Clearing & Forwarding agents — administrator only (permission "agents.manage").
import { and, asc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { agents, records } from "@/db/schema";
import { audit, type Actor } from "./audit";
import { HttpError } from "./api";

const s = (v: unknown, max = 300) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim()).slice(0, max);
type AgentRow = typeof agents.$inferSelect;
const FIELDS = ["name", "licenseNo", "tin", "contactPerson", "phone", "email", "address", "notes"] as const;
const LABEL: Record<(typeof FIELDS)[number], string> = {
  name: "Name", licenseNo: "Licence No.", tin: "TIN", contactPerson: "Contact person", phone: "Phone", email: "Email", address: "Address", notes: "Notes",
};

function adminOnly(actor: Actor) {
  if (actor.role !== "admin") throw new HttpError(403, "Only administrators can manage Clearing & Forwarding agents.");
}

async function parse(b: Record<string, unknown>, excludeId?: number) {
  const out = {
    name: s(b.name, 200), licenseNo: s(b.licenseNo, 100) || null, tin: s(b.tin, 50) || null, contactPerson: s(b.contactPerson, 150) || null,
    phone: s(b.phone, 50) || null, email: s(b.email, 200) || null, address: s(b.address, 300) || null, notes: s(b.notes, 1000) || null,
  };
  if (!out.name) throw new HttpError(400, "Agent name is required.");
  if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw new HttpError(400, "Agent email is not valid.");
  const [dup] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(sql`lower(trim(${agents.name})) = ${out.name.toLowerCase()}`, excludeId ? ne(agents.id, excludeId) : undefined))
    .limit(1);
  if (dup) throw new HttpError(409, `An agent called "${out.name}" already exists.`);
  return out;
}

/** Dropdown options. Any signed-in user may read these (active only unless all=true). */
export async function agentOptions(all: boolean) {
  const rows = await db
    .select({ id: agents.id, name: agents.name, status: agents.status })
    .from(agents)
    .where(all ? undefined : eq(agents.status, "active"))
    .orderBy(asc(agents.name));
  return { rows };
}

export async function listAgents(sp: URLSearchParams) {
  const q = s(sp.get("q"));
  const status = s(sp.get("status"));
  const c: (SQL | undefined)[] = [];
  if (q) {
    const p = `%${q}%`;
    c.push(or(ilike(agents.name, p), ilike(agents.licenseNo, p), ilike(agents.tin, p), ilike(agents.contactPerson, p), ilike(agents.phone, p), ilike(agents.email, p)));
  }
  if (status) c.push(eq(agents.status, status));
  const rows = await db
    .select({ a: agents, n: sql<number>`(select count(*)::int from "records" r where r."agent_id" = "agents"."id")` })
    .from(agents)
    .where(and(...c))
    .orderBy(asc(agents.name));
  const all = await db.select({ status: agents.status, n: sql<number>`count(*)::int` }).from(agents).groupBy(agents.status);
  const cnt = (st: string) => all.find((x) => x.status === st)?.n ?? 0;
  return {
    rows: rows.map((r) => ({ ...r.a, records: r.n })),
    totals: { all: cnt("active") + cnt("blocked"), active: cnt("active"), blocked: cnt("blocked") },
  };
}

async function load(id: number): Promise<AgentRow> {
  const [a] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  if (!a) throw new HttpError(404, "Agent not found.");
  return a;
}

export async function createAgent(b: Record<string, unknown>, actor: Actor) {
  adminOnly(actor);
  const v = await parse(b);
  const [a] = await db.insert(agents).values({ ...v, createdBy: actor.id }).returning();
  await audit(db, { actor, action: "agent_created", fieldName: a.name, newValue: v });
  return { id: a.id };
}

export async function updateAgent(id: number, b: Record<string, unknown>, actor: Actor) {
  adminOnly(actor);
  const ex = await load(id);

  // block / unblock
  if (b.status !== undefined) {
    const status = s(b.status);
    if (!["active", "blocked"].includes(status)) throw new HttpError(400, "Invalid status.");
    if (status === ex.status) return { changed: false };
    const reason = s(b.reason, 500);
    if (status === "blocked" && !reason) throw new HttpError(400, "Please give a reason for blocking this agent.");
    await db
      .update(agents)
      .set(status === "blocked" ? { status, blockedReason: reason, blockedAt: new Date(), updatedAt: new Date() } : { status, blockedReason: null, blockedAt: null, updatedAt: new Date() })
      .where(eq(agents.id, id));
    await audit(db, { actor, action: status === "blocked" ? "agent_blocked" : "agent_unblocked", fieldName: ex.name, reason: reason || null });
    return { changed: true };
  }

  const v = await parse(b, id);
  const diffs = FIELDS.filter((k) => (ex[k] ?? "") !== (v[k] ?? ""));
  if (!diffs.length) return { changed: false };
  await db.transaction(async (tx) => {
    await tx.update(agents).set({ ...v, updatedAt: new Date() }).where(eq(agents.id, id));
    // keep the name shown on linked records in sync (e.g. spelling correction)
    if (v.name !== ex.name) await tx.update(records).set({ agentName: v.name }).where(eq(records.agentId, id));
    for (const k of diffs)
      await audit(tx, { actor, action: "agent_edited", fieldName: `${ex.name} — ${LABEL[k]}`, oldValue: ex[k] ?? "", newValue: v[k] ?? "" });
  });
  return { changed: true };
}

export async function deleteAgent(id: number, reason: string, actor: Actor) {
  adminOnly(actor);
  if (!reason.trim()) throw new HttpError(400, "Please give a reason for deleting this agent.");
  const ex = await load(id);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(records).where(eq(records.agentId, id));
  await db.transaction(async (tx) => {
    // records keep the agent's name (snapshot); the link is cleared by the foreign key (ON DELETE SET NULL)
    await tx.delete(agents).where(eq(agents.id, id));
    await audit(tx, { actor, action: "agent_deleted", fieldName: ex.name, oldValue: { ...ex, linkedRecords: n }, reason });
  });
  return { linkedRecords: n };
}
