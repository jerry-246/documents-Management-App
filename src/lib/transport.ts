// ADMIN ONLY — transport charges, payments to transporters and balances.
// Every caller must be behind the "transport.manage" permission (administrator only).
import { and, desc, eq, gte, ilike, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { records, transportPayments, users } from "@/db/schema";
import { audit, type Actor } from "./audit";
import { HttpError } from "./api";
import { filtersFromParams, getCtx, queryRecords } from "./records";
import { getCurrency } from "./settings";
import { isISODate, todayISO } from "./time";
import { PAYMENT_METHODS, payStatus, r2, type PaymentRow, type PayStatus } from "./payments-shared";

const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const key = (t: string) => t.trim().toLowerCase();
const fmt2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function paidByRecord(): Promise<Map<number, number>> {
  const rows = await db
    .select({ id: transportPayments.recordId, sum: sql<string>`sum(${transportPayments.amount})` })
    .from(transportPayments)
    .where(isNotNull(transportPayments.recordId))
    .groupBy(transportPayments.recordId);
  return new Map(rows.map((r) => [r.id!, Number(r.sum)]));
}

export async function transporterNames(): Promise<string[]> {
  const a = await db.selectDistinct({ t: records.transporter }).from(records).where(isNotNull(records.transporter));
  const b = await db.selectDistinct({ t: transportPayments.transporter }).from(transportPayments);
  const m = new Map<string, string>();
  for (const r of [...a, ...b]) if (r.t) m.set(key(r.t), m.get(key(r.t)) ?? r.t.trim());
  return [...m.values()].sort((x, y) => x.localeCompare(y));
}

// ---------------- charges (per container) ----------------
export async function queryTransport(sp: URLSearchParams) {
  const f = filtersFromParams(sp);
  f.pageSize = undefined;
  const exact = sp.get("exact") === "1" ? s(sp.get("transporter")).toLowerCase() : "";
  const ctx = await getCtx(true);
  const [{ rows }, paid] = await Promise.all([queryRecords(f, ctx), paidByRecord()]);
  const onlyExtra = sp.get("charges") === "1";
  const pay = sp.get("pay") ?? "";
  const list = rows
    .filter((r) => {
      const t = r.transport;
      if (!t) return false;
      if (!(t.transporter || t.transportCost != null || t.extraCharges != null || paid.has(r.id))) return false;
      if (exact && (t.transporter ?? "").trim().toLowerCase() !== exact) return false;
      return !onlyExtra || (t.extraCharges ?? 0) > 0;
    })
    .map((r) => {
      const p = r2(paid.get(r.id) ?? 0);
      const t = r.transport!;
      return {
        id: r.id, recordDate: r.recordDate, invoiceNo: r.invoiceNo, containerNo: r.containerNo, companyName: r.companyName, stageLabel: r.stageLabel, archived: r.archived,
        ...t, paid: p, balance: r2(t.total - p), payStatus: payStatus(t.total, p) as PayStatus,
      };
    })
    .filter((r) => !pay || (pay === "outstanding" ? r.balance > 0 : r.payStatus === pay));
  const sum = (fn: (r: (typeof list)[number]) => number) => r2(list.reduce((a, r) => a + fn(r), 0));
  const totals = {
    count: list.length,
    cost: sum((r) => r.transportCost ?? 0),
    extra: sum((r) => r.extraCharges ?? 0),
    total: sum((r) => r.total),
    paid: sum((r) => r.paid),
    balance: sum((r) => r.balance),
  };
  return { rows: list, totals, transporters: await transporterNames(), currency: await getCurrency() };
}

// ---------------- payments ----------------
export async function listPayments(sp: URLSearchParams) {
  const g = (k: string) => s(sp.get(k)) || undefined;
  const c: (SQL | undefined)[] = [];
  const q = g("q");
  if (q) {
    const p = `%${q}%`;
    c.push(or(ilike(transportPayments.transporter, p), ilike(transportPayments.reference, p), ilike(transportPayments.notes, p), ilike(records.invoiceNo, p), ilike(records.containerNo, p)));
  }
  if (g("transporter")) c.push(sql`lower(trim(${transportPayments.transporter})) = ${key(g("transporter")!)}`);
  if (g("method")) c.push(eq(transportPayments.method, g("method")!));
  if (g("from")) c.push(gte(transportPayments.paymentDate, g("from")!));
  if (g("to")) c.push(lte(transportPayments.paymentDate, g("to")!));
  if (g("recordId")) c.push(eq(transportPayments.recordId, Number(g("recordId"))));
  if (g("link") === "general") c.push(sql`${transportPayments.recordId} is null`);
  if (g("link") === "record") c.push(isNotNull(transportPayments.recordId));
  const raw = await db
    .select({ p: transportPayments, invoiceNo: records.invoiceNo, containerNo: records.containerNo, by: users.name })
    .from(transportPayments)
    .leftJoin(records, eq(transportPayments.recordId, records.id))
    .leftJoin(users, eq(transportPayments.createdBy, users.id))
    .where(and(...c))
    .orderBy(desc(transportPayments.paymentDate), desc(transportPayments.id));
  const rows: PaymentRow[] = raw.map((x) => ({
    id: x.p.id, recordId: x.p.recordId, invoiceNo: x.invoiceNo, containerNo: x.containerNo, transporter: x.p.transporter,
    amount: Number(x.p.amount), paymentDate: x.p.paymentDate, method: x.p.method, reference: x.p.reference, notes: x.p.notes,
    createdByName: x.by, createdAt: x.p.createdAt.toISOString(),
  }));
  return {
    rows,
    totals: { count: rows.length, amount: r2(rows.reduce((a, r) => a + r.amount, 0)) },
    transporters: await transporterNames(),
    currency: await getCurrency(),
  };
}

// ---------------- balances per transporter ----------------
export async function transporterBalances() {
  const charged = await db
    .select({
      t: records.transporter,
      n: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(coalesce(${records.transportCost},0) + coalesce(${records.extraCharges},0)),0)`,
    })
    .from(records)
    .where(isNotNull(records.transporter))
    .groupBy(records.transporter);
  const paid = await db
    .select({ t: transportPayments.transporter, n: sql<number>`count(*)::int`, total: sql<string>`sum(${transportPayments.amount})`, last: sql<string>`max(${transportPayments.paymentDate})::text` })
    .from(transportPayments)
    .groupBy(transportPayments.transporter);
  const perRecord = await queryTransport(new URLSearchParams({ archived: "all" }));
  const m = new Map<string, { transporter: string; records: number; charged: number; paid: number; payments: number; lastPayment: string | null; unpaidRecords: number }>();
  const get = (t: string) => {
    const k = key(t);
    if (!m.has(k)) m.set(k, { transporter: t.trim(), records: 0, charged: 0, paid: 0, payments: 0, lastPayment: null, unpaidRecords: 0 });
    return m.get(k)!;
  };
  for (const r of charged) if (r.t) { const e = get(r.t); e.records += r.n; e.charged += Number(r.total); }
  for (const r of paid) {
    const e = get(r.t);
    e.paid += Number(r.total);
    e.payments += r.n;
    if (!e.lastPayment || r.last > e.lastPayment) e.lastPayment = r.last;
  }
  for (const r of perRecord.rows) if (r.transporter && r.balance > 0) get(r.transporter).unpaidRecords++;
  const rows = [...m.values()]
    .map((e) => ({ ...e, charged: r2(e.charged), paid: r2(e.paid), balance: r2(e.charged - e.paid), status: payStatus(e.charged, e.paid) }))
    .sort((a, b) => b.balance - a.balance || a.transporter.localeCompare(b.transporter));
  const sum = (fn: (r: (typeof rows)[number]) => number) => r2(rows.reduce((a, r) => a + fn(r), 0));
  return { rows, totals: { transporters: rows.length, charged: sum((r) => r.charged), paid: sum((r) => r.paid), balance: sum((r) => r.balance) }, currency: await getCurrency() };
}

// ---------------- create / edit / delete ----------------
function money(v: unknown): string {
  const raw = typeof v === "number" ? String(v) : s(v).replace(/[,\s]/g, "");
  if (!raw) throw new HttpError(400, "Enter the amount paid.");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new HttpError(400, "Amount must be a positive number with at most 2 decimals.");
  const n = Number(raw);
  if (!(n > 0)) throw new HttpError(400, "Amount must be greater than zero.");
  if (n > 99_999_999_999) throw new HttpError(400, "Amount is too large.");
  return n.toFixed(2);
}

async function parsePayment(b: Record<string, unknown>) {
  const amount = money(b.amount);
  const paymentDate = s(b.paymentDate) || todayISO();
  if (!isISODate(paymentDate)) throw new HttpError(400, "Payment date is not valid.");
  const method = s(b.method) || "bank";
  if (!(method in PAYMENT_METHODS)) throw new HttpError(400, "Choose a valid payment method.");
  const reference = s(b.reference).slice(0, 200) || null;
  const notes = s(b.notes).slice(0, 1000) || null;
  const recordId = b.recordId === null || b.recordId === undefined || s(b.recordId) === "" ? null : Number(b.recordId);
  let transporter = s(b.transporter).slice(0, 200);
  if (recordId !== null) {
    if (!Number.isInteger(recordId)) throw new HttpError(400, "Invalid container record.");
    const [rec] = await db.select({ t: records.transporter }).from(records).where(eq(records.id, recordId)).limit(1);
    if (!rec) throw new HttpError(404, "Container record not found.");
    if (!rec.t) throw new HttpError(400, "This record has no transporter yet. Add the transporter under Transport & charges first.");
    transporter = rec.t;
  }
  if (!transporter) throw new HttpError(400, "Choose the transporter being paid.");
  return { recordId, transporter, amount, paymentDate, method, reference, notes };
}

type P = Awaited<ReturnType<typeof parsePayment>>;
const describe = (p: P, cur: string) =>
  `${cur} ${fmt2(Number(p.amount))} to ${p.transporter} on ${p.paymentDate} via ${PAYMENT_METHODS[p.method] ?? p.method}${p.reference ? ` (ref ${p.reference})` : ""}${p.recordId ? "" : " — general payment"}`;

export async function createPayment(b: Record<string, unknown>, actor: Actor) {
  if (actor.role !== "admin") throw new HttpError(403, "Only administrators can record transporter payments.");
  const p = await parsePayment(b);
  const cur = await getCurrency();
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(transportPayments).values({ ...p, createdBy: actor.id }).returning({ id: transportPayments.id });
    await audit(tx, { actor, recordId: p.recordId, action: "transport_payment_added", fieldName: "Payment", newValue: describe(p, cur), reason: p.notes });
    return { id: row.id };
  });
}

export async function updatePayment(id: number, b: Record<string, unknown>, actor: Actor) {
  if (actor.role !== "admin") throw new HttpError(403, "Only administrators can edit transporter payments.");
  const [ex] = await db.select().from(transportPayments).where(eq(transportPayments.id, id)).limit(1);
  if (!ex) throw new HttpError(404, "Payment not found.");
  const p = await parsePayment(b);
  const cur = await getCurrency();
  const old: P = { recordId: ex.recordId, transporter: ex.transporter, amount: Number(ex.amount).toFixed(2), paymentDate: ex.paymentDate, method: ex.method, reference: ex.reference, notes: ex.notes };
  if (JSON.stringify(old) === JSON.stringify(p)) return { changed: false };
  await db.transaction(async (tx) => {
    await tx.update(transportPayments).set({ ...p, updatedAt: new Date() }).where(eq(transportPayments.id, id));
    await audit(tx, { actor, recordId: p.recordId ?? ex.recordId, action: "transport_payment_edited", fieldName: `Payment #${id}`, oldValue: describe(old, cur), newValue: describe(p, cur), reason: s(b.reason) || null });
  });
  return { changed: true };
}

export async function deletePayment(id: number, reason: string, actor: Actor) {
  if (actor.role !== "admin") throw new HttpError(403, "Only administrators can delete transporter payments.");
  if (!reason.trim()) throw new HttpError(400, "Please give a reason for deleting this payment.");
  const [ex] = await db.select().from(transportPayments).where(eq(transportPayments.id, id)).limit(1);
  if (!ex) throw new HttpError(404, "Payment not found.");
  const cur = await getCurrency();
  const old: P = { recordId: ex.recordId, transporter: ex.transporter, amount: ex.amount, paymentDate: ex.paymentDate, method: ex.method, reference: ex.reference, notes: ex.notes };
  await db.transaction(async (tx) => {
    await audit(tx, { actor, recordId: ex.recordId, action: "transport_payment_deleted", fieldName: `Payment #${id}`, oldValue: describe(old, cur), reason });
    await tx.delete(transportPayments).where(eq(transportPayments.id, id));
  });
}
