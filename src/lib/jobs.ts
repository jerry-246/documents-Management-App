import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailNotifications, notifications } from "@/db/schema";
import { audit } from "./audit";
import { esc, retrySend, sendEmail, type Attachment } from "./email";
import { RECORD_COLS, recordExportRows, toPdf, toXlsx } from "./export";
import { getCtx, queryRecords } from "./records";
import { monthlyReport, periodReport } from "./reports";
import { getEmailSettings, getSetting, setSetting } from "./settings";
import { addDays, fmtDate, fmtDateLong, nowHHmm, todayISO, weekdayOf } from "./time";
import { DOC_INFO, DOC_TYPES } from "./validation";

export type ReportKind = "daily" | "weekly" | "monthly";
const KIND_LABEL: Record<ReportKind, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const APP_URL = () => (process.env.APP_URL ?? "").replace(/\/$/, "");

function windowFor(kind: ReportKind, today: string): { from: string; to: string } {
  if (kind === "daily") return { from: today, to: today };
  if (kind === "weekly") return { from: addDays(today, -6), to: today };
  // monthly: previous full month
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const p = String(pm).padStart(2, "0");
  return { from: `${py}-${p}-01`, to: `${py}-${p}-${String(last).padStart(2, "0")}` };
}

function subjectFor(kind: ReportKind, from: string, to: string) {
  if (kind === "daily") return `Daily Container Tracking Report – ${fmtDateLong(from)}`;
  if (kind === "weekly") return `Weekly Container Tracking Report – ${fmtDateLong(from)} to ${fmtDateLong(to)}`;
  return `Monthly Container Tracking Report – ${new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(from + "T00:00:00Z"))}`;
}

async function buildAttachments(kind: ReportKind, from: string, to: string, pdf: boolean, xlsx: boolean): Promise<Attachment[]> {
  if (!pdf && !xlsx) return [];
  const rep = await periodReport(from, to);
  const rows = recordExportRows(rep.rows);
  const title = subjectFor(kind, from, to);
  const base = `${kind}-report-${from}${from === to ? "" : "_" + to}`;
  const out: Attachment[] = [];
  if (pdf)
    out.push({
      filename: base + ".pdf",
      contentType: "application/pdf",
      content: toPdf(title, RECORD_COLS, rows, [
        `Total: ${rep.summary.total}   Completed: ${rep.summary.completed}   Pending: ${rep.summary.pending}   Expiring soon: ${rep.summary.expiringSoon}   Critical: ${rep.summary.critical}   Expired: ${rep.summary.expired}   Validation errors: ${rep.summary.validationErrors}`,
      ]),
    });
  if (xlsx) out.push({ filename: base + ".xlsx", content: toXlsx(RECORD_COLS, rows, "Records") });
  return out;
}

export async function sendReport(kind: ReportKind, range?: { from: string; to: string }, actor?: { id: number; name: string } | null) {
  const es = await getEmailSettings();
  const { from, to } = range ?? windowFor(kind, todayISO());
  const rep = kind === "monthly" ? await monthlyReport(Number(from.slice(0, 4)), Number(from.slice(5, 7))) : await periodReport(from, to);
  const s = rep.summary;
  const recipients = es.recipients;
  if (!recipients.length) {
    await audit(db, { actor, action: "report_skipped", newValue: `${kind} report skipped — no recipients configured` });
    return { ok: false, skipped: true, error: "No recipients configured" };
  }
  const subject = subjectFor(kind, from, to);
  const ctx = await getCtx();
  const alerts = (await import("./records")).expiryRows;
  const upcoming = (await alerts({ preset: "next14" })).slice(0, 25);
  const expired = (await alerts({ preset: "expired" })).slice(0, 25);
  const td = "padding:6px 10px;border:1px solid #e2e8f0;font-size:13px";
  const row = (l: string, v: number) => `<tr><td style="${td}">${l}</td><td style="${td};font-weight:bold">${v}</td></tr>`;
  const detail = rep.rows
    .slice(0, 100)
    .map(
      (r) =>
        `<tr><td style="${td}">${esc(r.invoiceNo)}</td><td style="${td}">${esc(r.containerNo)}</td><td style="${td}">${esc(r.companyName ?? "")}</td><td style="${td}">${esc(r.im7No ?? "")}</td><td style="${td}">${esc(r.im4No ?? "")}</td><td style="${td}">${esc(r.exitNo ?? "")}</td><td style="${td}">${esc(r.stageLabel)}</td></tr>`,
    )
    .join("");
  const exp = (list: typeof upcoming) =>
    list
      .map(
        (e) =>
          `<tr><td style="${td}">${e.doc}</td><td style="${td}">${esc(e.number)}</td><td style="${td}">${esc(e.containerNo)}</td><td style="${td}">${fmtDate(e.expiryDate)}</td><td style="${td}">${e.daysRemaining}</td></tr>`,
      )
      .join("");
  const html = `<div style="font-family:Arial,sans-serif;color:#0f172a">
<h2>${esc(subject)}</h2>
<table style="border-collapse:collapse">${row("Total Records", s.total)}${row("Completed", s.completed)}${row("Pending", s.pending + s.inProgress)}${row("Expiring Soon", s.expiringSoon)}${row("Critical", s.critical)}${row("Expired", s.expired)}${row("Validation Errors", s.validationErrors)}${row("Stage Movements", s.stageMovements)}</table>
<h3>Records (${fmtDate(from)}${from === to ? "" : " – " + fmtDate(to)})</h3>
${detail ? `<table style="border-collapse:collapse"><tr><th style="${td}">Invoice</th><th style="${td}">Container</th><th style="${td}">Company</th><th style="${td}">IM7</th><th style="${td}">IM4</th><th style="${td}">Exit</th><th style="${td}">Stage</th></tr>${detail}</table>` : "<p>No records in this period.</p>"}
<h3>Documents expiring within 14 days</h3>${upcoming.length ? `<table style="border-collapse:collapse"><tr><th style="${td}">Doc</th><th style="${td}">Number</th><th style="${td}">Container</th><th style="${td}">Expiry</th><th style="${td}">Days</th></tr>${exp(upcoming)}</table>` : "<p>None.</p>"}
<h3>Expired documents</h3>${expired.length ? `<table style="border-collapse:collapse"><tr><th style="${td}">Doc</th><th style="${td}">Number</th><th style="${td}">Container</th><th style="${td}">Expiry</th><th style="${td}">Days</th></tr>${exp(expired)}</table>` : "<p>None.</p>"}
${APP_URL() ? `<p><a href="${APP_URL()}">Open the Container Tracking System</a></p>` : ""}
<p style="color:#64748b;font-size:12px">Generated ${fmtDate(ctx.today)} (Africa/Kampala)</p></div>`;
  const payload = { kind, from, to, pdf: es.attachPdf, xlsx: es.attachExcel };
  const attachments = await buildAttachments(kind, from, to, es.attachPdf, es.attachExcel);
  const res = await sendEmail({
    to: recipients, cc: es.cc, subject, html, attachments,
    type: `${kind}_report`, label: `${KIND_LABEL[kind]} Report`, dedupeKey: `report:${kind}:${from}:${to}:${Date.now()}`, payload,
  });
  await audit(db, { actor, action: "report_generated", newValue: `${kind} report ${from}..${to}: ${res.ok ? "sent" : "failed"}`, reason: res.error ?? null });
  await db.insert(notifications).values({
    kind: "report",
    message: res.ok ? `${KIND_LABEL[kind]} report successfully sent.` : `${KIND_LABEL[kind]} report failed to send: ${res.error}`,
    link: "/emails",
  });
  return { ok: res.ok, error: res.error, skipped: false };
}

export async function retryEmail(id: number) {
  const [row] = await db.select().from(emailNotifications).where(eq(emailNotifications.id, id)).limit(1);
  if (!row) return { ok: false, error: "Email not found" };
  let attachments: Attachment[] | undefined;
  const p = row.payload as { kind?: ReportKind; from?: string; to?: string; pdf?: boolean; xlsx?: boolean } | null;
  if (p?.kind && p.from && p.to) attachments = await buildAttachments(p.kind, p.from, p.to, !!p.pdf, !!p.xlsx);
  return retrySend(id, attachments);
}

// ---------------- expiry alerts ----------------
export async function runExpiryAlerts(): Promise<{ inApp: number; emails: number; failed: number }> {
  const es = await getEmailSettings();
  const ctx = await getCtx();
  const { rows } = await queryRecords({ archived: "0" }, ctx);
  const days = [...es.reminderDays].filter((n) => n >= 0).sort((a, b) => a - b);
  const existing = new Set(
    (
      await db
        .select({ k: emailNotifications.dedupeKey })
        .from(emailNotifications)
        .where(inArray(emailNotifications.notificationType, ["expiry_reminder", "critical_alert", "expired"]))
    ).map((r) => r.k),
  );
  let inApp = 0, emails = 0, failed = 0;
  for (const v of rows) {
    if (!v.monitored) continue;
    for (const d of DOC_TYPES) {
      const dv = v.docs[d];
      if (!dv.number || dv.daysRemaining === null || !dv.expiryDate) continue;
      const label = DOC_INFO[d].label;
      let band: string;
      let type: string;
      if (dv.daysRemaining < 0) {
        band = "expired";
        type = "expired";
      } else {
        const n = days.find((x) => x >= dv.daysRemaining!);
        if (n === undefined) continue;
        band = `d${n}`;
        type = dv.daysRemaining <= ctx.rules[d].warning3Days ? "critical_alert" : "expiry_reminder";
      }
      const key = `exp:${v.id}:${d}:${dv.expiryDate}:${band}`;
      const text =
        band === "expired"
          ? `${label} for Container ${v.containerNo} has expired (expired ${fmtDate(dv.expiryDate)}).`
          : `${label} for Container ${v.containerNo} will expire in ${dv.daysRemaining} day${dv.daysRemaining === 1 ? "" : "s"} (${fmtDate(dv.expiryDate)}).`;
      const ins = await db
        .insert(notifications)
        .values({ kind: "expiry", message: `${band === "expired" ? "Expired" : "Expiring"} ${text}`, link: `/records/${v.id}`, dedupeKey: key })
        .onConflictDoNothing()
        .returning({ id: notifications.id });
      inApp += ins.length;
      const enabled = es.expiryEnabled && (band !== "expired" || es.expiredEnabled) && es.recipients.length > 0;
      if (!enabled || existing.has(key)) continue;
      existing.add(key);
      const tag = band === "expired" ? "[EXPIRED]" : type === "critical_alert" ? "[CRITICAL]" : "[Reminder]";
      const html = `<div style="font-family:Arial,sans-serif;color:#0f172a"><h3>${tag} ${esc(text)}</h3>
<table style="border-collapse:collapse;font-size:13px">
<tr><td style="padding:4px 10px"><b>Invoice</b></td><td>${esc(v.invoiceNo)}</td></tr>
<tr><td style="padding:4px 10px"><b>Container</b></td><td>${esc(v.containerNo)}</td></tr>
<tr><td style="padding:4px 10px"><b>${label} No.</b></td><td>${esc(dv.number)}</td></tr>
<tr><td style="padding:4px 10px"><b>Expiry date</b></td><td>${fmtDate(dv.expiryDate)}</td></tr>
<tr><td style="padding:4px 10px"><b>Current stage</b></td><td>${esc(v.stageLabel)}</td></tr></table>
${APP_URL() ? `<p><a href="${APP_URL()}/records/${v.id}">Open record</a></p>` : ""}</div>`;
      const r = await sendEmail({
        to: es.recipients, cc: es.cc, subject: `${tag} ${label} – Container ${v.containerNo}: ${band === "expired" ? "expired" : `${dv.daysRemaining} day(s) left`}`,
        html, recordId: v.id, docType: d, type, label: band === "expired" ? `${label} Expired` : `${label} Reminder`, dedupeKey: key,
      });
      if (r.ok) emails++;
      else failed++;
    }
  }
  return { inApp, emails, failed };
}

// ---------------- scheduler ----------------
interface JobState { daily?: string; weekly?: string; monthly?: string; expiry?: string }
let running = false;

export async function runDueJobs() {
  if (running) return;
  running = true;
  try {
    const es = await getEmailSettings();
    const today = todayISO();
    const hhmm = nowHHmm();
    const state = await getSetting<JobState>("job_state", {});
    const save = (patch: JobState) => setSetting("job_state", { ...state, ...patch }, null);
    if (hhmm >= es.expiryTime && state.expiry !== today) {
      state.expiry = today;
      await save({ expiry: today });
      await runExpiryAlerts();
    }
    if (hhmm >= es.dailyTime) {
      if (es.dailyEnabled && state.daily !== today) {
        state.daily = today;
        await save({ daily: today });
        await sendReport("daily");
      }
      if (es.weeklyEnabled && weekdayOf(today) === es.weeklyDay && state.weekly !== today) {
        state.weekly = today;
        await save({ weekly: today });
        await sendReport("weekly");
      }
      if (es.monthlyEnabled && today.endsWith("-01") && state.monthly !== today) {
        state.monthly = today;
        await save({ monthly: today });
        await sendReport("monthly");
      }
    }
  } catch (e) {
    console.error("[scheduler] error", e);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  const g = globalThis as typeof globalThis & { __ctsScheduler?: NodeJS.Timeout };
  if (g.__ctsScheduler) return;
  g.__ctsScheduler = setInterval(() => void runDueJobs(), 60_000);
  setTimeout(() => void runDueJobs(), 15_000);
  console.log("[scheduler] started (checks every 60s, Africa/Kampala)");
}

export async function countUnsentSummary() {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(emailNotifications)
    .where(and(eq(emailNotifications.status, "failed")));
  return r.n;
}
