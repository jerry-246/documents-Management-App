import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { records, stageHistory, validationErrors } from "@/db/schema";
import { expiryRows, getCtx, queryRecords, type RecordView } from "./records";
import { addDays, endOfDayKampalaExclusive, monthRange, startOfDayKampala } from "./time";
import { DOC_TYPES } from "./validation";

export function summarize(rows: RecordView[]) {
  const c = (f: (r: RecordView) => boolean) => rows.filter(f).length;
  return {
    total: rows.length,
    completed: c((r) => r.processing === "completed"),
    inProgress: c((r) => r.processing === "in_progress"),
    pending: c((r) => r.processing === "pending"),
    expiringSoon: c((r) => r.worstStatus === "expiring_soon"),
    critical: c((r) => r.worstStatus === "critical"),
    expired: c((r) => r.worstStatus === "expired"),
  };
}

export async function dashboardData() {
  const ctx = await getCtx();
  const { rows } = await queryRecords({ archived: "0" }, ctx);
  const monthStart = ctx.today.slice(0, 8) + "01";
  const sm = summarize(rows);
  const [errCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(validationErrors)
    .where(eq(validationErrors.resolved, false));
  const [errToday] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(validationErrors)
    .where(gte(validationErrors.createdAt, startOfDayKampala(ctx.today)));
  const upcoming = (await expiryRows({})).slice(0, 300);
  return {
    cards: {
      ...sm,
      today: rows.filter((r) => r.recordDate === ctx.today).length,
      thisMonth: rows.filter((r) => r.recordDate >= monthStart && r.recordDate <= ctx.today).length,
      validationErrors: errCount.n,
      errorsToday: errToday.n,
    },
    workflow: ctx.stages
      .filter((s) => s.active)
      .map((s) => ({ key: s.key, label: s.label, isFinal: s.isFinal, count: rows.filter((r) => r.currentStage === s.key).length })),
    upcoming,
  };
}

export async function periodReport(from: string, to: string) {
  const ctx = await getCtx();
  const { rows } = await queryRecords({ from, to, archived: "0" }, ctx);
  const s = startOfDayKampala(from);
  const e = endOfDayKampalaExclusive(to);
  const [errs] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(validationErrors)
    .where(and(gte(validationErrors.createdAt, s), lt(validationErrors.createdAt, e)));
  const [moves] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(stageHistory)
    .where(and(gte(stageHistory.movedAt, s), lt(stageHistory.movedAt, e)));
  return { from, to, summary: { ...summarize(rows), validationErrors: errs.n, stageMovements: moves.n }, rows };
}

export async function monthlyReport(year: number, month: number) {
  const { from, to } = monthRange(year, month);
  const base = await periodReport(from, to);
  const ctx = await getCtx();
  const s = startOfDayKampala(from);
  const e = endOfDayKampalaExclusive(to);
  const docCount = { IM7: 0, IM4: 0, EXIT: 0 };
  let expiredDocs = 0;
  let expiringDocs = 0;
  for (const r of base.rows)
    for (const d of DOC_TYPES) {
      const dv = r.docs[d];
      if (dv.number) docCount[d]++;
      if (r.monitored && dv.status === "expired") expiredDocs++;
      if (r.monitored && (dv.status === "expiring_soon" || dv.status === "critical")) expiringDocs++;
    }
  const moves = await db
    .select({ stage: stageHistory.newStage, n: sql<number>`count(*)::int` })
    .from(stageHistory)
    .where(and(gte(stageHistory.movedAt, s), lt(stageHistory.movedAt, e)))
    .groupBy(stageHistory.newStage);
  const byDay = new Map<string, number>();
  for (const r of base.rows) byDay.set(r.recordDate, (byDay.get(r.recordDate) ?? 0) + 1);
  const days: { date: string; count: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push({ date: d.slice(8), count: byDay.get(d) ?? 0 });
  return {
    ...base,
    year,
    month,
    documents: { im7: docCount.IM7, im4: docCount.IM4, exit: docCount.EXIT, expired: expiredDocs, expiring: expiringDocs },
    stageMoves: moves.map((m) => ({ label: ctx.stageMap.get(m.stage)?.label ?? m.stage, count: m.n })),
    recordsByDay: days,
  };
}

export async function analytics() {
  const ctx = await getCtx();
  const { rows } = await queryRecords({ archived: "0" }, ctx);
  const from30 = addDays(ctx.today, -29);
  const dayRows = await db
    .select({ d: records.recordDate, n: sql<number>`count(*)::int` })
    .from(records)
    .where(and(eq(records.archived, false), gte(records.recordDate, from30)))
    .groupBy(records.recordDate);
  const dm = new Map(dayRows.map((r) => [r.d, r.n]));
  const byDay: { date: string; count: number }[] = [];
  for (let d = from30; d <= ctx.today; d = addDays(d, 1)) byDay.push({ date: d.slice(5), count: dm.get(d) ?? 0 });

  const y = Number(ctx.today.slice(0, 4));
  const m = Number(ctx.today.slice(5, 7));
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const t = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const monthRows = await db
    .select({ m: sql<string>`to_char(${records.recordDate}, 'YYYY-MM')`, n: sql<number>`count(*)::int` })
    .from(records)
    .where(and(eq(records.archived, false), gte(records.recordDate, months[0] + "-01")))
    .groupBy(sql`to_char(${records.recordDate}, 'YYYY-MM')`);
  const mm = new Map(monthRows.map((r) => [r.m, r.n]));
  const byMonth = months.map((k) => ({ month: k, count: mm.get(k) ?? 0 }));

  const sm = summarize(rows);
  const errRows = await db
    .select({ f: validationErrors.fieldName, n: sql<number>`count(*)::int` })
    .from(validationErrors)
    .groupBy(validationErrors.fieldName);
  const errs = { IM7: 0, IM4: 0, Exit: 0, Other: 0 };
  for (const r of errRows) {
    if (r.f === "IM7") errs.IM7 += r.n;
    else if (r.f === "IM4") errs.IM4 += r.n;
    else if (r.f === "Exit") errs.Exit += r.n;
    else errs.Other += r.n;
  }
  const monitored = rows.filter((r) => r.monitored);
  const cnt = (s: string) => monitored.filter((r) => r.worstStatus === s).length;
  return {
    byDay,
    byMonth,
    processing: [
      { name: "Pending", value: sm.pending },
      { name: "In Progress", value: sm.inProgress },
      { name: "Completed", value: sm.completed },
    ],
    expiry: [
      { name: "Active", value: cnt("active") },
      { name: "Expiring Soon", value: cnt("expiring_soon") },
      { name: "Critical", value: cnt("critical") },
      { name: "Expired", value: cnt("expired") },
    ],
    errors: Object.entries(errs).map(([name, value]) => ({ name, value })),
  };
}
