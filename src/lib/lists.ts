import { and, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, emailNotifications, validationErrors } from "@/db/schema";
import { endOfDayKampalaExclusive, startOfDayKampala } from "./time";

function common(sp: URLSearchParams) {
  const g = (k: string) => sp.get(k)?.trim() || undefined;
  const page = Math.max(1, Number(g("page")) || 1);
  const size = g("all") ? undefined : Math.min(200, Number(g("pageSize")) || 25);
  return { g, page, size, from: g("from"), to: g("to") };
}

export async function queryErrors(sp: URLSearchParams) {
  const { g, page, size, from, to } = common(sp);
  const c: (SQL | undefined)[] = [];
  const q = g("q");
  if (q) {
    const p = `%${q}%`;
    c.push(or(ilike(validationErrors.invoiceNo, p), ilike(validationErrors.containerNo, p), ilike(validationErrors.enteredValue, p), ilike(validationErrors.errorMessage, p), ilike(validationErrors.userName, p)));
  }
  if (g("field")) c.push(eq(validationErrors.fieldName, g("field")!));
  if (g("resolved") === "1") c.push(eq(validationErrors.resolved, true));
  if (g("resolved") === "0") c.push(eq(validationErrors.resolved, false));
  if (g("user")) c.push(eq(validationErrors.userId, Number(g("user"))));
  if (from) c.push(gte(validationErrors.createdAt, startOfDayKampala(from)));
  if (to) c.push(lt(validationErrors.createdAt, endOfDayKampalaExclusive(to)));
  const w = and(...c);
  const [t] = await db.select({ n: sql<number>`count(*)::int` }).from(validationErrors).where(w);
  let qy = db.select().from(validationErrors).where(w).orderBy(desc(validationErrors.createdAt), desc(validationErrors.id)).$dynamic();
  if (size) qy = qy.limit(size).offset((page - 1) * size);
  return { rows: await qy, total: t.n, page, pageSize: size ?? t.n };
}

export async function queryAudit(sp: URLSearchParams, isAdmin = false) {
  const { g, page, size, from, to } = common(sp);
  const c: (SQL | undefined)[] = [];
  const q = g("q");
  if (q) {
    const p = `%${q}%`;
    c.push(or(ilike(auditLogs.userName, p), ilike(auditLogs.action, p), ilike(auditLogs.fieldName, p), ilike(auditLogs.oldValue, p), ilike(auditLogs.newValue, p), ilike(auditLogs.reason, p)));
  }
  // transport cost history is administrator-only
  if (!isAdmin) c.push(sql`${auditLogs.action} not like 'transport%'`);
  if (g("action")) c.push(eq(auditLogs.action, g("action")!));
  if (g("user")) c.push(eq(auditLogs.userId, Number(g("user"))));
  if (g("recordId")) c.push(eq(auditLogs.recordId, Number(g("recordId"))));
  if (from) c.push(gte(auditLogs.createdAt, startOfDayKampala(from)));
  if (to) c.push(lt(auditLogs.createdAt, endOfDayKampalaExclusive(to)));
  const w = and(...c);
  const [t] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLogs).where(w);
  let qy = db.select().from(auditLogs).where(w).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).$dynamic();
  if (size) qy = qy.limit(size).offset((page - 1) * size);
  return { rows: await qy, total: t.n, page, pageSize: size ?? t.n };
}

export async function queryEmails(sp: URLSearchParams) {
  const { g, page, size, from, to } = common(sp);
  const c: (SQL | undefined)[] = [];
  const q = g("q");
  if (q) {
    const p = `%${q}%`;
    c.push(or(ilike(emailNotifications.recipient, p), ilike(emailNotifications.subject, p), ilike(emailNotifications.label, p)));
  }
  if (g("status")) c.push(eq(emailNotifications.status, g("status")!));
  if (g("type")) {
    const t = g("type")!;
    if (t === "daily") c.push(eq(emailNotifications.notificationType, "daily_report"));
    else if (t === "weekly") c.push(eq(emailNotifications.notificationType, "weekly_report"));
    else if (t === "monthly") c.push(eq(emailNotifications.notificationType, "monthly_report"));
    else if (t === "expiry") c.push(sql`${emailNotifications.notificationType} in ('expiry_reminder','critical_alert','expired')`);
    else c.push(eq(emailNotifications.notificationType, t));
  }
  if (from) c.push(gte(emailNotifications.createdAt, startOfDayKampala(from)));
  if (to) c.push(lt(emailNotifications.createdAt, endOfDayKampalaExclusive(to)));
  const w = and(...c);
  const [t] = await db.select({ n: sql<number>`count(*)::int` }).from(emailNotifications).where(w);
  let qy = db
    .select({
      id: emailNotifications.id, recordId: emailNotifications.recordId, documentType: emailNotifications.documentType,
      notificationType: emailNotifications.notificationType, label: emailNotifications.label, recipient: emailNotifications.recipient,
      subject: emailNotifications.subject, status: emailNotifications.status, errorMessage: emailNotifications.errorMessage,
      retryCount: emailNotifications.retryCount, sentAt: emailNotifications.sentAt, createdAt: emailNotifications.createdAt,
    })
    .from(emailNotifications)
    .where(w)
    .orderBy(desc(emailNotifications.createdAt), desc(emailNotifications.id))
    .$dynamic();
  if (size) qy = qy.limit(size).offset((page - 1) * size);
  return { rows: await qy, total: t.n, page, pageSize: size ?? t.n };
}
