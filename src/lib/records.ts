import { and, desc, eq, gte, ilike, inArray, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { agents, auditLogs, emailNotifications, records, stageHistory, transportPayments, users, validationErrors } from "@/db/schema";
import { audit, logValidationErrors, type Actor } from "./audit";
import { HttpError } from "./api";
import { getCurrency, getRules, getStages, getValidationSettings, type Stage } from "./settings";
import { diffDays, todayISO } from "./time";
import {
  DOC_INFO,
  DOC_STAGE,
  DOC_TYPES,
  docStopped,
  NEXT_STEP_STATUSES,
  calcExpiry,
  expiryStatusFor,
  validateRecordFields,
  type DocType,
  type ExpiryRule,
  type ExpiryStatus,
  type FieldError,
} from "./validation";

export type RecordRow = typeof records.$inferSelect;
type RecordInsert = typeof records.$inferInsert;

export const DOC_FIELDS = {
  IM7: { no: "im7No", issue: "im7IssueDate", validity: "im7ValidityDays", expiry: "im7ExpiryDate", calc: "im7CalculatedAt" },
  IM4: { no: "im4No", issue: "im4IssueDate", validity: "im4ValidityDays", expiry: "im4ExpiryDate", calc: "im4CalculatedAt" },
  EXIT: { no: "exitNo", issue: "exitIssueDate", validity: "exitValidityDays", expiry: "exitExpiryDate", calc: "exitCalculatedAt" },
} as const;

// ---------------- context ----------------
export interface Ctx {
  rules: Record<DocType, ExpiryRule>;
  stages: Stage[];
  stageMap: Map<string, Stage>;
  finalKeys: string[];
  caseSensitive: boolean;
  today: string;
  /** administrator only: include transporter / cost fields in views and allow searching them */
  showTransport: boolean;
}

export async function getCtx(showTransport = false): Promise<Ctx> {
  const [rules, stages, v] = await Promise.all([getRules(), getStages(), getValidationSettings()]);
  return {
    rules,
    stages,
    stageMap: new Map(stages.map((s) => [s.key, s])),
    finalKeys: stages.filter((s) => s.isFinal).map((s) => s.key),
    caseSensitive: v.caseSensitive,
    today: todayISO(),
    showTransport,
  };
}

// ---------------- input ----------------
export interface RecordInput {
  invoiceNo: string;
  containerNo: string;
  companyName: string;
  agentId: string;
  agentName: string;
  im7No: string;
  va: string;
  im4No: string;
  exitNo: string;
  recordDate: string;
  im7IssueDate: string;
  im4IssueDate: string;
  exitIssueDate: string;
  remarks: string;
}
const KEYS = [
  "invoiceNo", "containerNo", "companyName", "agentId", "agentName", "im7No", "va", "im4No", "exitNo",
  "recordDate", "im7IssueDate", "im4IssueDate", "exitIssueDate", "remarks",
] as const;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

export function cleanInput(b: Record<string, unknown>, base?: Partial<RecordInput>): RecordInput {
  const o = {} as Record<string, string>;
  for (const k of KEYS) o[k] = k in b ? s(b[k]) : (base?.[k] ?? "");
  return o as unknown as RecordInput;
}

function normalize(i: RecordInput, ctx: Ctx): RecordInput {
  const n = { ...i };
  n.containerNo = n.containerNo.toUpperCase();
  if (!ctx.caseSensitive) {
    n.im7No = n.im7No.toUpperCase();
    n.im4No = n.im4No.toUpperCase();
    n.exitNo = n.exitNo.toUpperCase();
  }
  for (const d of DOC_TYPES) {
    const f = DOC_FIELDS[d];
    const key = f.issue as "im7IssueDate" | "im4IssueDate" | "exitIssueDate";
    const noKey = f.no as "im7No" | "im4No" | "exitNo";
    n[key] = n[noKey] ? n[key] || n.recordDate : "";
  }
  return n;
}

/** Backend-authoritative expiry calculation. Uses the rule in force NOW and stores it. */
function computeDoc(doc: DocType, no: string, issue: string, rule: ExpiryRule): Partial<RecordInsert> {
  const f = DOC_FIELDS[doc];
  const out: Record<string, unknown> = {};
  out[f.no] = no || null;
  if (no && rule.active) {
    out[f.issue] = issue;
    out[f.validity] = rule.validityDays;
    out[f.expiry] = calcExpiry(issue, rule.validityDays);
    out[f.calc] = new Date();
  } else {
    out[f.issue] = no ? issue : null;
    out[f.validity] = null;
    out[f.expiry] = null;
    out[f.calc] = null;
  }
  return out as Partial<RecordInsert>;
}

// ---------------- views ----------------
export interface DocView {
  doc: DocType;
  number: string | null;
  issueDate: string | null;
  validityDays: number | null;
  expiryDate: string | null;
  calculatedAt: Date | null;
  daysRemaining: number | null;
  status: ExpiryStatus | null;
  /** record has moved past this document's stage → expiry no longer counted, alerted or listed */
  stopped: boolean;
}
export type TransportKey = "transporter" | "transportCost" | "extraCharges" | "chargesReason";
const TRANSPORT_KEYS: TransportKey[] = ["transporter", "transportCost", "extraCharges", "chargesReason"];
export interface TransportView {
  transporter: string | null;
  transportCost: number | null;
  extraCharges: number | null;
  total: number;
  chargesReason: string | null;
}

/** Remove administrator-only fields from a raw records row. */
export function omitTransport<T extends object>(r: T): Omit<T, TransportKey> {
  const c = { ...r } as Record<string, unknown>;
  for (const k of TRANSPORT_KEYS) delete c[k];
  return c as Omit<T, TransportKey>;
}

export interface RecordView extends Omit<RecordRow, TransportKey> {
  transport?: TransportView;
  docs: Record<DocType, DocView>;
  worstStatus: ExpiryStatus | null;
  stageLabel: string;
  isFinal: boolean;
  monitored: boolean;
  processing: "pending" | "in_progress" | "completed";
  createdByName: string | null;
}
const RANK: Record<ExpiryStatus, number> = { active: 0, expiring_soon: 1, critical: 2, expired: 3 };

export function toView(r: RecordRow, by: string | null, ctx: Ctx): RecordView {
  const { transporter, transportCost, extraCharges, chargesReason, ...rest } = r;
  const cost = transportCost == null ? null : Number(transportCost);
  const extra = extraCharges == null ? null : Number(extraCharges);
  const stage = ctx.stageMap.get(r.currentStage);
  const isFinal = !!stage?.isFinal;
  const monitored = !r.archived && !isFinal;
  const docs = {} as Record<DocType, DocView>;
  let worst: ExpiryStatus | null = null;
  const posOf = (k: string) => ctx.stageMap.get(k)?.position;
  for (const d of DOC_TYPES) {
    const f = DOC_FIELDS[d];
    const number = r[f.no];
    const expiry = r[f.expiry];
    const stopped = !!number && docStopped(d, stage?.position, posOf);
    const days = number && expiry && !stopped ? diffDays(ctx.today, expiry) : null;
    const status = days === null ? null : expiryStatusFor(days, ctx.rules[d]);
    docs[d] = {
      doc: d, number, issueDate: r[f.issue], validityDays: r[f.validity], expiryDate: expiry,
      calculatedAt: r[f.calc], daysRemaining: days, status, stopped,
    };
    if (monitored && status && (worst === null || RANK[status] > RANK[worst])) worst = status;
  }
  return {
    ...rest,
    transport: ctx.showTransport
      ? { transporter, transportCost: cost, extraCharges: extra, total: Math.round(((cost ?? 0) + (extra ?? 0)) * 100) / 100, chargesReason }
      : undefined,
    docs,
    worstStatus: worst,
    stageLabel: stage?.label ?? r.currentStage,
    isFinal,
    monitored,
    processing: isFinal ? "completed" : r.status === "in_progress" ? "in_progress" : "pending",
    createdByName: r.createdByName ?? by,
  };
}

// ---------------- querying ----------------
export interface RecordFilters {
  transporter?: string;
  q?: string; invoice?: string; container?: string; company?: string; agent?: number; stage?: string; status?: string;
  processing?: string; user?: number; date?: string; from?: string; to?: string;
  month?: number; year?: number; expiry?: ExpiryStatus; doc?: DocType; withinDays?: number;
  archived?: "0" | "1" | "all"; page?: number; pageSize?: number;
}

export function filtersFromParams(sp: URLSearchParams): RecordFilters {
  const g = (k: string) => sp.get(k)?.trim() || undefined;
  const n = (k: string) => {
    const v = g(k);
    return v !== undefined && /^-?\d+$/.test(v) ? Number(v) : undefined;
  };
  const doc = g("doc")?.toUpperCase();
  const exp = g("expiry");
  const arch = g("archived");
  return {
    transporter: g("transporter"), q: g("q"), invoice: g("invoice"), container: g("container"), company: g("company"), agent: n("agent"), stage: g("stage"), status: g("status"),
    processing: g("processing"), user: n("user"), date: g("date"), from: g("from"), to: g("to"),
    month: n("month"), year: n("year"),
    expiry: exp && ["active", "expiring_soon", "critical", "expired"].includes(exp) ? (exp as ExpiryStatus) : undefined,
    doc: doc && (DOC_TYPES as string[]).includes(doc) ? (doc as DocType) : undefined,
    withinDays: n("withinDays"),
    archived: arch === "1" || arch === "all" ? arch : "0",
    page: n("page"), pageSize: n("pageSize"),
  };
}

export async function queryRecords(f: RecordFilters, ctxIn?: Ctx): Promise<{ rows: RecordView[]; total: number }> {
  const ctx = ctxIn ?? (await getCtx());
  const c: (SQL | undefined)[] = [];
  if (f.archived === "1") c.push(eq(records.archived, true));
  else if (f.archived !== "all") c.push(eq(records.archived, false));
  if (f.invoice) c.push(ilike(records.invoiceNo, `%${f.invoice}%`));
  if (f.container) c.push(ilike(records.containerNo, `%${f.container}%`));
  if (f.company) c.push(ilike(records.companyName, `%${f.company}%`));
  if (f.agent) c.push(eq(records.agentId, f.agent));
  if (f.transporter && ctx.showTransport) c.push(ilike(records.transporter, `%${f.transporter}%`));
  if (f.stage) c.push(eq(records.currentStage, f.stage));
  if (f.status) c.push(eq(records.status, f.status));
  if (f.user) c.push(eq(records.createdBy, f.user));
  if (f.date) c.push(eq(records.recordDate, f.date));
  if (f.from) c.push(gte(records.recordDate, f.from));
  if (f.to) c.push(lte(records.recordDate, f.to));
  if (f.month) c.push(sql`extract(month from ${records.recordDate}) = ${f.month}`);
  if (f.year) c.push(sql`extract(year from ${records.recordDate}) = ${f.year}`);
  if (f.processing) {
    const fin = ctx.finalKeys.length ? ctx.finalKeys : ["__none__"];
    if (f.processing === "completed") c.push(inArray(records.currentStage, fin));
    else if (f.processing === "in_progress")
      c.push(sql`${records.currentStage} not in (${sql.join(fin.map((k) => sql`${k}`), sql`, `)}) and ${records.status} = 'in_progress'`);
    else if (f.processing === "pending")
      c.push(sql`${records.currentStage} not in (${sql.join(fin.map((k) => sql`${k}`), sql`, `)}) and ${records.status} <> 'in_progress'`);
  }
  if (f.q) {
    const p = `%${f.q}%`;
    const stageKeys = ctx.stages.filter((st) => st.label.toLowerCase().includes(f.q!.toLowerCase())).map((st) => st.key);
    c.push(
      or(
        ilike(records.invoiceNo, p), ilike(records.containerNo, p), ilike(records.companyName, p), ilike(records.agentName, p), ilike(records.im7No, p),
        ilike(records.va, p), ilike(records.im4No, p), ilike(records.exitNo, p),
        ilike(records.status, p), ilike(records.currentStage, p), ilike(records.remarks, p),
        ctx.showTransport ? ilike(records.transporter, p) : undefined,
        sql`${records.recordDate}::text like ${p}`,
        sql`to_char(${records.recordDate}, 'DD/MM/YYYY') like ${p}`,
        stageKeys.length ? inArray(records.currentStage, stageKeys) : undefined,
      ),
    );
  }
  const raw = await db
    .select({ r: records, by: users.name })
    .from(records)
    .leftJoin(users, eq(records.createdBy, users.id))
    .where(and(...c))
    .orderBy(desc(records.recordDate), desc(records.id));

  let views = raw.map((x) => toView(x.r, x.by, ctx));
  if (f.expiry || f.doc || f.withinDays !== undefined) {
    const docs = f.doc ? [f.doc] : DOC_TYPES;
    views = views.filter((v) => {
      if ((f.expiry || f.withinDays !== undefined) && !v.monitored) return false;
      return docs.some((d) => {
        const dv = v.docs[d];
        if (dv.daysRemaining === null) return false;
        if (f.expiry && dv.status !== f.expiry) return false;
        if (f.withinDays !== undefined && !(dv.daysRemaining >= 0 && dv.daysRemaining <= f.withinDays)) return false;
        return true;
      });
    });
  }
  const total = views.length;
  if (f.pageSize) {
    const page = Math.max(1, f.page ?? 1);
    views = views.slice((page - 1) * f.pageSize, page * f.pageSize);
  }
  return { rows: views, total };
}

// ---------------- expiry monitoring ----------------
export interface ExpiryRow {
  recordId: number; invoiceNo: string; containerNo: string; companyName: string | null; doc: DocType; number: string;
  issueDate: string | null; validityDays: number | null; expiryDate: string; daysRemaining: number;
  status: ExpiryStatus; stage: string;
}

export async function expiryRows(o: {
  preset?: string; doc?: DocType; status?: ExpiryStatus; from?: string; to?: string; includeCompleted?: boolean; company?: string;
}): Promise<ExpiryRow[]> {
  const comp = (o.company ?? "").trim().toLowerCase();
  const ctx = await getCtx();
  const { rows } = await queryRecords({ archived: "0" }, ctx);
  const win: Record<string, [number, number]> = { today: [0, 0], next3: [0, 3], next7: [0, 7], next14: [0, 14], next30: [0, 30] };
  const out: ExpiryRow[] = [];
  for (const v of rows) {
    if (!o.includeCompleted && v.isFinal) continue;
    if (comp && !(v.companyName ?? "").toLowerCase().includes(comp)) continue;
    for (const d of DOC_TYPES) {
      if (o.doc && o.doc !== d) continue;
      const dv = v.docs[d];
      if (!dv.number || !dv.expiryDate || dv.daysRemaining === null || !dv.status) continue;
      const days = dv.daysRemaining;
      if (o.preset === "expired" && days >= 0) continue;
      if (o.preset && win[o.preset] && (days < win[o.preset][0] || days > win[o.preset][1])) continue;
      if (o.preset === "custom" || (!o.preset && (o.from || o.to))) {
        if (o.from && dv.expiryDate < o.from) continue;
        if (o.to && dv.expiryDate > o.to) continue;
      }
      if (o.status && dv.status !== o.status) continue;
      out.push({
        recordId: v.id, invoiceNo: v.invoiceNo, containerNo: v.containerNo, companyName: v.companyName, doc: d, number: dv.number,
        issueDate: dv.issueDate, validityDays: dv.validityDays, expiryDate: dv.expiryDate,
        daysRemaining: days, status: dv.status, stage: v.stageLabel,
      });
    }
  }
  return out.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

// ---------------- duplicates ----------------
export async function findDuplicates(i: RecordInput, excludeId?: number) {
  const lower = (col: typeof records.invoiceNo | typeof records.im7No | typeof records.im4No, v: string) =>
    sql`lower(${col}) = ${v.toLowerCase()}`;
  const conds: SQL[] = [];
  if (i.invoiceNo && i.containerNo)
    conds.push(sql`(${lower(records.invoiceNo, i.invoiceNo)} and upper(${records.containerNo}) = ${i.containerNo.toUpperCase()})`);
  if (i.im7No) conds.push(lower(records.im7No, i.im7No));
  if (i.im4No) conds.push(lower(records.im4No, i.im4No));
  if (!conds.length) return [];
  const rows = await db
    .select()
    .from(records)
    .where(and(eq(records.archived, false), or(...conds), excludeId ? ne(records.id, excludeId) : undefined))
    .limit(5);
  return rows.map((r) => {
    const matched: string[] = [];
    if (r.invoiceNo.toLowerCase() === i.invoiceNo.toLowerCase() && r.containerNo.toUpperCase() === i.containerNo.toUpperCase())
      matched.push("Invoice + Container");
    if (i.im7No && r.im7No?.toLowerCase() === i.im7No.toLowerCase()) matched.push("IM7");
    if (i.im4No && r.im4No?.toLowerCase() === i.im4No.toLowerCase()) matched.push("IM4");
    return { id: r.id, invoiceNo: r.invoiceNo, containerNo: r.containerNo, im7No: r.im7No, im4No: r.im4No, recordDate: r.recordDate, matchedOn: matched };
  });
}

/** Validate a candidate row without saving (used by Excel import preview). */
export async function checkInput(body: Record<string, unknown>, ctx: Ctx) {
  const input = cleanInput(body);
  const errors = validateRecordFields(input, { caseSensitive: ctx.caseSensitive });
  const ag = await checkAgent(input.agentId, input.agentName, null);
  if (ag.error) errors.push(ag.error);
  else input.agentId = String(ag.agent!.id);
  const n = normalize(input, ctx);
  const duplicates = errors.length ? [] : await findDuplicates(n);
  const expiry: Record<string, string | null> = {};
  for (const d of DOC_TYPES) {
    const f = DOC_FIELDS[d];
    const noKey = f.no as "im7No" | "im4No" | "exitNo";
    const issueKey = f.issue as "im7IssueDate" | "im4IssueDate" | "exitIssueDate";
    expiry[d] = n[noKey] && !errors.length && ctx.rules[d].active ? calcExpiry(n[issueKey], ctx.rules[d].validityDays) : null;
  }
  return { input: n, errors, duplicates, expiry };
}

// ---------------- create ----------------
export async function createRecord(
  body: Record<string, unknown>,
  actor: Actor,
  opts: { confirmDuplicate?: boolean; source?: "form" | "import" | "api" } = {},
) {
  const ctx = await getCtx();
  const input = cleanInput(body);
  const errors = validateRecordFields(input, { caseSensitive: ctx.caseSensitive });
  const ag = await checkAgent(input.agentId, input.agentName, null);
  if (ag.error) errors.push(ag.error);
  if (errors.length) {
    await logValidationErrors(errors, actor, { invoiceNo: input.invoiceNo, containerNo: input.containerNo, source: opts.source ?? "form" });
    throw new HttpError(422, errors[0].message, { errors });
  }
  const n = normalize(input, ctx);
  const active = ctx.stages.filter((x) => x.active);
  const first = active[0] ?? ctx.stages[0];
  const chosen = s(body.currentStage) || first.key;
  const stage = ctx.stageMap.get(chosen);
  if (!stage || (!stage.active && chosen !== first.key)) throw new HttpError(400, "Unknown or inactive stage.");
  let status = s(body.status) || "pending";
  if (!(NEXT_STEP_STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "Invalid next step status.");
  if (stage.isFinal) status = "completed";

  const tp = actor.role === "admin" && TRANSPORT_KEYS.some((k) => k in body) ? parseTransport(body) : null;

  const dups = await findDuplicates(n);
  if (dups.length && !opts.confirmDuplicate)
    throw new HttpError(409, "Possible duplicate record detected.", { duplicates: dups });

  const created = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(records)
      .values({
        invoiceNo: n.invoiceNo, containerNo: n.containerNo, companyName: n.companyName || null,
        agentId: ag.agent!.id, agentName: ag.agent!.name, va: n.va || null, recordDate: n.recordDate,
        remarks: n.remarks || null, currentStage: stage.key, status, createdBy: actor.id,
        createdByName: actor.name, createdByPosition: actor.position ?? null, createdByEmail: actor.email,
        ...(tp ?? {}),
        ...computeDoc("IM7", n.im7No, n.im7IssueDate, ctx.rules.IM7),
        ...computeDoc("IM4", n.im4No, n.im4IssueDate, ctx.rules.IM4),
        ...computeDoc("EXIT", n.exitNo, n.exitIssueDate, ctx.rules.EXIT),
      })
      .returning();
    await tx.insert(stageHistory).values({
      recordId: r.id, previousStage: null, newStage: first.key, movedBy: actor.id, movedByName: actor.name, movedByPosition: actor.position ?? null, remarks: "Record created",
    });
    if (stage.key !== first.key)
      await tx.insert(stageHistory).values({
        recordId: r.id, previousStage: first.key, newStage: stage.key, movedBy: actor.id, movedByName: actor.name, movedByPosition: actor.position ?? null, remarks: "Stage selected at creation",
      });
    await audit(tx, {
      actor, recordId: r.id, action: opts.source === "import" ? "record_imported" : "record_created",
      newValue: { invoiceNo: r.invoiceNo, containerNo: r.containerNo, companyName: r.companyName, agent: r.agentName, im7No: r.im7No, im4No: r.im4No, exitNo: r.exitNo, im7ExpiryDate: r.im7ExpiryDate, im4ExpiryDate: r.im4ExpiryDate, exitExpiryDate: r.exitExpiryDate },
    });
    if (tp && hasTransport(tp)) await auditTransport(tx, actor, r.id, EMPTY_TRANSPORT, tp, "Entered when the record was created");
    return r;
  });
  return omitTransport(created);
}

// ---------------- edit ----------------
const TRACK: { key: keyof RecordInput; label: string; significant: boolean; col: keyof RecordRow }[] = [
  { key: "invoiceNo", label: "Invoice No.", significant: true, col: "invoiceNo" },
  { key: "containerNo", label: "Container No.", significant: true, col: "containerNo" },
  { key: "companyName", label: "Company Name", significant: false, col: "companyName" },
  { key: "im7No", label: "IM7 No.", significant: true, col: "im7No" },
  { key: "va", label: "VA", significant: false, col: "va" },
  { key: "im4No", label: "IM4 No.", significant: true, col: "im4No" },
  { key: "exitNo", label: "Exit No.", significant: true, col: "exitNo" },
  { key: "recordDate", label: "Record Date", significant: true, col: "recordDate" },
  { key: "im7IssueDate", label: "IM7 Issue Date", significant: true, col: "im7IssueDate" },
  { key: "im4IssueDate", label: "IM4 Issue Date", significant: true, col: "im4IssueDate" },
  { key: "exitIssueDate", label: "Exit Issue Date", significant: true, col: "exitIssueDate" },
  { key: "remarks", label: "Remarks", significant: false, col: "remarks" },
];

export async function loadRecord(id: number): Promise<RecordRow> {
  const [r] = await db.select().from(records).where(eq(records.id, id)).limit(1);
  if (!r) throw new HttpError(404, "Record not found");
  return r;
}

export async function updateRecord(
  id: number,
  body: Record<string, unknown>,
  actor: Actor,
  opts: { reason?: string; confirmDuplicate?: boolean } = {},
) {
  const ex = await loadRecord(id);
  if (ex.archived) throw new HttpError(400, "Archived records must be restored before editing.");
  const ctx = await getCtx();
  const base = Object.fromEntries(TRACK.map((t) => [t.key, (ex[t.col] as string | null) ?? ""])) as unknown as RecordInput;
  base.agentId = ex.agentId ? String(ex.agentId) : "";
  base.agentName = "";
  const input = cleanInput(body, base);
  const errors = validateRecordFields(input, { caseSensitive: ctx.caseSensitive });
  const ag = await checkAgent(input.agentId, input.agentName, ex.agentId);
  if (ag.error) errors.push(ag.error);
  if (errors.length) {
    await logValidationErrors(errors, actor, { recordId: id, invoiceNo: input.invoiceNo, containerNo: input.containerNo, source: "edit" });
    throw new HttpError(422, errors[0].message, { errors });
  }
  const n = normalize(input, ctx);
  const changes = TRACK.filter((t) => ((ex[t.col] as string | null) ?? "") !== n[t.key]);
  const agentChanged = ag.agent!.id !== ex.agentId;
  if (!changes.length && !agentChanged) return { record: omitTransport(ex), changes: 0 };
  const reason = (opts.reason ?? "").trim();
  if ((changes.some((c) => c.significant) || (agentChanged && ex.agentId)) && !reason)
    throw new HttpError(400, "A reason is required when changing document numbers, dates, invoice, container or the C&F agent.", { reasonRequired: true });
  if (changes.some((c) => ["invoiceNo", "containerNo", "im7No", "im4No"].includes(c.key)) && !opts.confirmDuplicate) {
    const dups = await findDuplicates(n, id);
    if (dups.length) throw new HttpError(409, "Possible duplicate record detected.", { duplicates: dups });
  }

  const patch: Partial<RecordInsert> = {
    invoiceNo: n.invoiceNo, containerNo: n.containerNo, companyName: n.companyName || null, va: n.va || null, recordDate: n.recordDate,
    remarks: n.remarks || null, updatedAt: new Date(),
    ...(agentChanged ? { agentId: ag.agent!.id, agentName: ag.agent!.name } : {}),
  };
  const expiryChanges: { doc: DocType; old: string | null; next: string | null; validity: number | null }[] = [];
  for (const d of DOC_TYPES) {
    const f = DOC_FIELDS[d];
    const noKey = f.no as "im7No" | "im4No" | "exitNo";
    const issueKey = f.issue as "im7IssueDate" | "im4IssueDate" | "exitIssueDate";
    if ((ex[f.no] ?? "") !== n[noKey] || (ex[f.issue] ?? "") !== n[issueKey]) {
      const p = computeDoc(d, n[noKey], n[issueKey], ctx.rules[d]);
      Object.assign(patch, p);
      const nextExpiry = (p as Record<string, unknown>)[f.expiry] as string | null;
      expiryChanges.push({ doc: d, old: ex[f.expiry], next: nextExpiry, validity: (p as Record<string, unknown>)[f.validity] as number | null });
    }
  }
  const updated = await db.transaction(async (tx) => {
    const [r] = await tx.update(records).set(patch).where(eq(records.id, id)).returning();
    if (agentChanged)
      await audit(tx, { actor, recordId: id, action: "record_edited", fieldName: "C&F Agent", oldValue: ex.agentName ?? "", newValue: ag.agent!.name, reason: reason || null });
    for (const c of changes)
      await audit(tx, { actor, recordId: id, action: "record_edited", fieldName: c.label, oldValue: (ex[c.col] as string | null) ?? "", newValue: n[c.key], reason: reason || null });
    for (const e of expiryChanges)
      if (e.old !== e.next)
        await audit(tx, { actor, recordId: id, action: "expiry_recalculated", fieldName: `${DOC_INFO[e.doc].label} Expiry`, oldValue: e.old, newValue: e.next, reason: `Recalculated using current rule (${e.validity ?? "n/a"} days)` });
    return r;
  });
  return { record: omitTransport(updated), changes: changes.length + (agentChanged ? 1 : 0) };
}

// ---------------- workflow ----------------
export async function moveRecord(id: number, body: Record<string, unknown>, actor: Actor) {
  const ex = await loadRecord(id);
  if (ex.archived) throw new HttpError(400, "Archived records cannot be moved.");
  if (body.moved !== true) return { moved: false, record: omitTransport(ex) };
  const ctx = await getCtx();
  const target = ctx.stageMap.get(s(body.newStage));
  if (!target || !target.active) throw new HttpError(400, "Please choose a valid next stage.");
  if (target.key === ex.currentStage) throw new HttpError(400, "The record is already in that stage.");
  let status = s(body.status) || "pending";
  if (!(NEXT_STEP_STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "Invalid next step status.");
  if (target.isFinal) status = "completed";
  const remarks = s(body.remarks);
  const updated = await db.transaction(async (tx) => {
    const [r] = await tx.update(records).set({ currentStage: target.key, status, updatedAt: new Date() }).where(eq(records.id, id)).returning();
    await tx.insert(stageHistory).values({
      recordId: id, previousStage: ex.currentStage, newStage: target.key, movedBy: actor.id, movedByName: actor.name, movedByPosition: actor.position ?? null, remarks: remarks || null,
    });
    await audit(tx, {
      actor, recordId: id, action: "stage_moved", fieldName: "Stage",
      oldValue: ctx.stageMap.get(ex.currentStage)?.label ?? ex.currentStage, newValue: target.label, reason: remarks || null,
    });
    const posOf = (k: string) => ctx.stageMap.get(k)?.position;
    const oldPos = posOf(ex.currentStage);
    for (const d of DOC_TYPES) {
      if (!ex[DOC_FIELDS[d].no] || !ex[DOC_FIELDS[d].expiry]) continue;
      const was = docStopped(d, oldPos, posOf);
      const now = docStopped(d, target.position, posOf);
      if (was === now) continue;
      await audit(tx, {
        actor, recordId: id, action: now ? "expiry_stopped" : "expiry_resumed", fieldName: `${DOC_INFO[d].label} Expiry`,
        oldValue: ex[DOC_FIELDS[d].expiry],
        newValue: now ? `Countdown stopped — moved to ${target.label}` : `Countdown resumed — moved back to ${target.label}`,
      });
    }
    return r;
  });
  return { moved: true, record: omitTransport(updated) };
}

export async function setArchived(id: number, archive: boolean, reason: string, actor: Actor) {
  const ex = await loadRecord(id);
  if (archive && !reason.trim()) throw new HttpError(400, "Please provide a reason for archiving.");
  if (ex.archived === archive) throw new HttpError(400, archive ? "Already archived." : "Record is not archived.");
  await db.transaction(async (tx) => {
    await tx.update(records).set(
      archive
        ? { archived: true, archivedAt: new Date(), archivedBy: actor.id, archiveReason: reason, updatedAt: new Date() }
        : { archived: false, archivedAt: null, archivedBy: null, archiveReason: null, updatedAt: new Date() },
    ).where(eq(records.id, id));
    await audit(tx, { actor, recordId: id, action: archive ? "record_archived" : "record_restored", reason: reason || null });
  });
}

export async function deleteRecordPermanently(id: number, reason: string, actor: Actor) {
  const ex = await loadRecord(id);
  if (!ex.archived) throw new HttpError(400, "Only archived records can be permanently deleted. Archive it first.");
  if (!reason.trim()) throw new HttpError(400, "A reason is required for permanent deletion.");
  await db.transaction(async (tx) => {
    await audit(tx, { actor, recordId: id, action: "record_deleted", oldValue: omitTransport(ex), reason });
    if (hasTransport(rowTransport(ex)))
      await audit(tx, { actor, recordId: id, action: "transport_deleted", oldValue: describeTransport(rowTransport(ex)), reason: `Record permanently deleted: ${reason}` });
    await tx.delete(records).where(eq(records.id, id));
  });
}

// ---------------- detail ----------------
export async function recordDetail(id: number, isAdmin = false) {
  const ctx = await getCtx(isAdmin);
  const [row] = await db
    .select({ r: records, by: users.name })
    .from(records)
    .leftJoin(users, eq(records.createdBy, users.id))
    .where(eq(records.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, "Record not found");
  const [history, auditRows, errs, emails] = await Promise.all([
    db.select().from(stageHistory).where(eq(stageHistory.recordId, id)).orderBy(stageHistory.movedAt, stageHistory.id),
    db.select().from(auditLogs).where(and(eq(auditLogs.recordId, id), isAdmin ? undefined : sql`${auditLogs.action} not like 'transport%'`)).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(200),
    db.select().from(validationErrors).where(eq(validationErrors.recordId, id)).orderBy(desc(validationErrors.createdAt)).limit(50),
    db.select().from(emailNotifications).where(eq(emailNotifications.recordId, id)).orderBy(desc(emailNotifications.createdAt)).limit(50),
  ]);
  // when (and to which stage) each document's countdown was stopped
  const posOf = (k: string) => ctx.stageMap.get(k)?.position ?? 0;
  const view = toView(row.r, row.by, ctx);
  const stops: Partial<Record<DocType, { at: Date; by: string | null; toLabel: string }>> = {};
  for (const d of DOC_TYPES) {
    if (!view.docs[d].stopped) continue;
    const dp = posOf(DOC_STAGE[d]);
    const h = [...history].reverse().find((x) => posOf(x.newStage) > dp && (!x.previousStage || posOf(x.previousStage) <= dp));
    if (h) stops[d] = { at: h.movedAt, by: h.movedByName, toLabel: ctx.stageMap.get(h.newStage)?.label ?? h.newStage };
  }
  const [agentRow] = row.r.agentId
    ? await db.select({ id: agents.id, name: agents.name, status: agents.status }).from(agents).where(eq(agents.id, row.r.agentId)).limit(1)
    : [];
  return {
    agent: row.r.agentName ? { id: row.r.agentId, name: row.r.agentName, status: agentRow ? agentRow.status : "deleted" } : null,
    record: view,
    stops,
    history: history.map((h) => ({
      ...h,
      previousLabel: h.previousStage ? (ctx.stageMap.get(h.previousStage)?.label ?? h.previousStage) : null,
      newLabel: ctx.stageMap.get(h.newStage)?.label ?? h.newStage,
    })),
    audit: auditRows,
    errors: errs,
    emails: emails.map((e) => ({ ...e, body: undefined })),
    stages: ctx.stages,
    currency: isAdmin ? await getCurrency() : undefined,
    payments: isAdmin
      ? (
          await db
            .select({ p: transportPayments, by: users.name })
            .from(transportPayments)
            .leftJoin(users, eq(transportPayments.createdBy, users.id))
            .where(eq(transportPayments.recordId, id))
            .orderBy(desc(transportPayments.paymentDate), desc(transportPayments.id))
        ).map((x) => ({
          id: x.p.id, recordId: x.p.recordId, invoiceNo: row.r.invoiceNo, containerNo: row.r.containerNo, transporter: x.p.transporter,
          amount: Number(x.p.amount), paymentDate: x.p.paymentDate, method: x.p.method, reference: x.p.reference, notes: x.p.notes,
          createdByName: x.by, createdAt: x.p.createdAt.toISOString(),
        }))
      : undefined,
  };
}


// ---------------- transport (ADMIN ONLY) ----------------
export interface TransportInput {
  transporter: string | null;
  transportCost: string | null;
  extraCharges: string | null;
  chargesReason: string | null;
}
const EMPTY_TRANSPORT: TransportInput = { transporter: null, transportCost: null, extraCharges: null, chargesReason: null };
const hasTransport = (t: TransportInput) => !!(t.transporter || t.transportCost || t.extraCharges || t.chargesReason);
const rowTransport = (r: RecordRow): TransportInput => ({
  transporter: r.transporter, transportCost: r.transportCost, extraCharges: r.extraCharges, chargesReason: r.chargesReason,
});
const fmt2 = (v: string | null) => (v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
function describeTransport(t: TransportInput) {
  return `Transporter: ${t.transporter ?? "—"}; Cost: ${fmt2(t.transportCost)}; Extra charges: ${fmt2(t.extraCharges)}; Reason: ${t.chargesReason ?? "—"}`;
}

function money(v: unknown, label: string): string | null {
  const raw = typeof v === "number" ? String(v) : s(v).replace(/[,\s]/g, "");
  if (!raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new HttpError(400, `${label} must be a positive amount with at most 2 decimals.`);
  const n = Number(raw);
  if (!isFinite(n) || n > 99_999_999_999) throw new HttpError(400, `${label} is too large.`);
  return n.toFixed(2);
}

export function parseTransport(b: Record<string, unknown>): TransportInput {
  const transporter = s(b.transporter).slice(0, 200) || null;
  const transportCost = money(b.transportCost, "Transport cost");
  const extraCharges = money(b.extraCharges, "Extra charges");
  const chargesReason = s(b.chargesReason).slice(0, 1000) || null;
  if ((transportCost || extraCharges) && !transporter) throw new HttpError(400, "Enter the transporter before entering transport costs.");
  if (extraCharges && Number(extraCharges) > 0 && !chargesReason)
    throw new HttpError(400, "Please write the reason for the extra charges.", { field: "chargesReason" });
  return { transporter, transportCost, extraCharges, chargesReason };
}

async function auditTransport(exec: Parameters<typeof audit>[0], actor: Actor, recordId: number, old: TransportInput, next: TransportInput, reason: string | null) {
  const fields: [keyof TransportInput, string, boolean][] = [
    ["transporter", "Transporter", false], ["transportCost", "Transport Cost", true],
    ["extraCharges", "Extra Charges", true], ["chargesReason", "Reason for charges", false],
  ];
  for (const [k, label, isMoney] of fields) {
    if ((old[k] ?? "") === (next[k] ?? "")) continue;
    await audit(exec, {
      actor, recordId, action: "transport_edited", fieldName: label,
      oldValue: isMoney ? fmt2(old[k]) : (old[k] ?? ""), newValue: isMoney ? fmt2(next[k]) : (next[k] ?? ""), reason,
    });
  }
}

export async function setTransport(id: number, body: Record<string, unknown>, actor: Actor) {
  if (actor.role !== "admin") throw new HttpError(403, "Only administrators can manage transport details.");
  const ex = await loadRecord(id);
  const next = parseTransport(body);
  const old = rowTransport(ex);
  if (JSON.stringify(old) === JSON.stringify(next)) return { changed: false };
  await db.transaction(async (tx) => {
    await tx.update(records).set({ ...next, updatedAt: new Date() }).where(eq(records.id, id));
    await auditTransport(tx, actor, id, old, next, next.chargesReason);
  });
  return { changed: true };
}

export async function clearTransport(id: number, reason: string, actor: Actor) {
  if (actor.role !== "admin") throw new HttpError(403, "Only administrators can manage transport details.");
  const ex = await loadRecord(id);
  const old = rowTransport(ex);
  if (!hasTransport(old)) throw new HttpError(400, "There are no transport details to delete.");
  await db.transaction(async (tx) => {
    await tx.update(records).set({ ...EMPTY_TRANSPORT, updatedAt: new Date() }).where(eq(records.id, id));
    await audit(tx, { actor, recordId: id, action: "transport_cleared", oldValue: describeTransport(old), reason: reason || null });
  });
}


// ---------------- C&F agent (mandatory, admin-managed list) ----------------
const AGENT_ERR = (value: string, message: string): FieldError => ({
  field: "agentId", label: "C&F Agent", value, expected: "Select an active agent from the admin list", message,
});

/** Resolve the agent by id (form) or by name (Excel import). Blocked agents may only be KEPT on a record, never newly assigned. */
export async function checkAgent(
  rawId: string,
  rawName: string,
  currentId: number | null,
): Promise<{ agent?: { id: number; name: string }; error?: FieldError }> {
  const id = /^\d+$/.test(rawId ?? "") ? Number(rawId) : null;
  const name = (rawName ?? "").trim();
  if (!id && !name) return { error: AGENT_ERR("", "Clearing & Forwarding agent is required. Select one from the list.") };
  const [a] = id
    ? await db.select().from(agents).where(eq(agents.id, id)).limit(1)
    : await db.select().from(agents).where(sql`lower(trim(${agents.name})) = ${name.toLowerCase()}`).limit(1);
  if (!a) return { error: AGENT_ERR(name || String(id), name ? `Agent "${name}" is not on the approved agent list. Ask the administrator to add it.` : "The selected agent no longer exists.") };
  if (a.status !== "active" && a.id !== currentId)
    return { error: AGENT_ERR(a.name, `Agent "${a.name}" is blocked and cannot be assigned to records.`) };
  return { agent: { id: a.id, name: a.name } };
}
