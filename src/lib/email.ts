import nodemailer from "nodemailer";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { emailNotifications } from "@/db/schema";
import { emailSecret, getEmailSettings } from "./settings";

export interface Attachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

async function transportSend(o: { to: string[]; cc?: string[]; subject: string; html: string; attachments?: Attachment[] }) {
  const es = await getEmailSettings();
  if (!es.host) throw new Error("SMTP host is not configured (Settings → Email Configuration).");
  if (!es.fromEmail) throw new Error("From email is not configured (Settings → Email Configuration).");
  const pass = emailSecret();
  if (es.username && !pass) throw new Error("SMTP password / API key is not set. Add SMTP_PASSWORD to the environment secrets.");
  const t = nodemailer.createTransport({
    host: es.host,
    port: es.port,
    secure: es.secure,
    auth: es.username ? { user: es.username, pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  await t.sendMail({
    from: `"${es.fromName.replace(/"/g, "")}" <${es.fromEmail}>`,
    to: o.to,
    cc: o.cc?.length ? o.cc : undefined,
    subject: o.subject,
    html: o.html,
    attachments: o.attachments,
  });
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

export interface SendOpts {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: Attachment[];
  recordId?: number | null;
  docType?: string | null;
  type: string; // daily_report | weekly_report | monthly_report | expiry_reminder | critical_alert | expired | test
  label: string;
  dedupeKey?: string;
  payload?: unknown;
}

/** Sends one message, and stores one email_notifications row per recipient (sent or failed). */
export async function sendEmail(o: SendOpts): Promise<{ ok: boolean; error?: string }> {
  const all = [...new Set([...o.to, ...(o.cc ?? [])])];
  const rows = await db
    .insert(emailNotifications)
    .values(
      all.map((r) => ({
        recordId: o.recordId ?? null,
        documentType: o.docType ?? null,
        notificationType: o.type,
        label: o.label,
        recipient: r,
        subject: o.subject,
        body: o.html,
        payload: o.payload ?? null,
        dedupeKey: o.dedupeKey ?? null,
        status: "pending",
      })),
    )
    .returning({ id: emailNotifications.id });
  const ids = rows.map((r) => r.id);
  try {
    await transportSend(o);
    await db.update(emailNotifications).set({ status: "sent", sentAt: new Date(), errorMessage: null }).where(inArray(emailNotifications.id, ids));
    return { ok: true };
  } catch (e) {
    await db.update(emailNotifications).set({ status: "failed", errorMessage: msg(e) }).where(inArray(emailNotifications.id, ids));
    return { ok: false, error: msg(e) };
  }
}

export async function retrySend(id: number, attachments?: Attachment[]): Promise<{ ok: boolean; error?: string }> {
  const [row] = await db.select().from(emailNotifications).where(eq(emailNotifications.id, id)).limit(1);
  if (!row) return { ok: false, error: "Email not found" };
  try {
    await transportSend({ to: [row.recipient], subject: row.subject, html: row.body, attachments });
    await db
      .update(emailNotifications)
      .set({ status: "sent", sentAt: new Date(), errorMessage: null, retryCount: row.retryCount + 1 })
      .where(eq(emailNotifications.id, id));
    return { ok: true };
  } catch (e) {
    await db
      .update(emailNotifications)
      .set({ status: "failed", errorMessage: msg(e), retryCount: row.retryCount + 1 })
      .where(eq(emailNotifications.id, id));
    return { ok: false, error: msg(e) };
  }
}

export const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
