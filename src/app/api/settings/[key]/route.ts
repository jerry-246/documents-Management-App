import { asc } from "drizzle-orm";
import { db } from "@/db";
import { expiryRules, workflowStages } from "@/db/schema";
import { audit } from "@/lib/audit";
import { HttpError, readJson, route, str } from "@/lib/api";
import {
  DEFAULT_EMAIL, emailSecret, getCurrency, getEmailSettings, getPermissionMatrix, getRules, getStages,
  getValidationSettings, setSetting, type EmailSettings,
} from "@/lib/settings";
import { ADMIN_ONLY, ALL_PERMISSIONS, PERMISSIONS, type Permission } from "@/lib/perms";
import { DOC_INFO, DOC_TYPES } from "@/lib/validation";

export const dynamic = "force-dynamic";

const int = (v: unknown, label: string, min: number, max: number) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label} must be a whole number between ${min} and ${max}.`);
  return n;
};
const emails = (v: unknown, label: string): string[] => {
  const list = (Array.isArray(v) ? v : String(v ?? "").split(/[,;\n]/)).map((x) => String(x).trim()).filter(Boolean);
  for (const e of list) if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new HttpError(400, `${label}: "${e}" is not a valid email address.`);
  return [...new Set(list)];
};
const time = (v: unknown, label: string) => {
  const t = str(v);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new HttpError(400, `${label} must be a time like 17:00.`);
  return t;
};

export const GET = route("settings.manage", async ({ params }) => {
  switch (params.key) {
    case "expiry":
      return { rules: Object.values(await getRules()) };
    case "stages":
      return { stages: await getStages() };
    case "email":
      return { settings: await getEmailSettings(), secretConfigured: !!emailSecret() };
    case "validation":
      return await getValidationSettings();
    case "permissions":
      return { matrix: await getPermissionMatrix(), catalogue: PERMISSIONS };
    case "currency":
      return { currency: await getCurrency() };
    default:
      throw new HttpError(404, "Unknown settings section");
  }
});

export const PUT = route("settings.manage", async ({ req, actor, params }) => {
  const b = await readJson(req);
  switch (params.key) {
    case "expiry": {
      if (b.confirm !== true) throw new HttpError(400, "Please confirm the change.");
      const input = Array.isArray(b.rules) ? (b.rules as Record<string, unknown>[]) : [];
      const old = await getRules();
      for (const d of DOC_TYPES) {
        const r = input.find((x) => x.documentType === d);
        if (!r) continue;
        const label = DOC_INFO[d].label;
        const validityDays = int(r.validityDays, `${label} validity`, 1, 3650);
        const warning1Days = int(r.warning1Days, `${label} warning 1`, 0, 3650);
        const warning2Days = int(r.warning2Days, `${label} warning 2`, 0, 3650);
        const warning3Days = int(r.warning3Days, `${label} warning 3`, 0, 3650);
        if (!(warning1Days >= warning2Days && warning2Days >= warning3Days))
          throw new HttpError(400, `${label}: warnings must be in descending order (Warning 1 ≥ Warning 2 ≥ Warning 3).`);
        const active = r.active !== false;
        const next = { validityDays, warning1Days, warning2Days, warning3Days, active };
        await db
          .insert(expiryRules)
          .values({ documentType: d, ...next, updatedBy: actor.id })
          .onConflictDoUpdate({ target: expiryRules.documentType, set: { ...next, updatedBy: actor.id, updatedAt: new Date() } });
        const o = old[d];
        if (JSON.stringify(next) !== JSON.stringify({ validityDays: o.validityDays, warning1Days: o.warning1Days, warning2Days: o.warning2Days, warning3Days: o.warning3Days, active: o.active }))
          await audit(db, { actor, action: "expiry_rule_change", fieldName: label, oldValue: o, newValue: next, reason: "Applies to new calculations only; existing records keep their stored expiry." });
      }
      return { ok: true };
    }
    case "stages": {
      const input = Array.isArray(b.stages) ? (b.stages as Record<string, unknown>[]) : [];
      if (!input.length) throw new HttpError(400, "At least one stage is required.");
      const existing = new Set((await getStages()).map((s) => s.key));
      const used = new Set<string>();
      const out = input.map((s, i) => {
        const label = str(s.label);
        if (!label) throw new HttpError(400, "Every stage needs a name.");
        let key = str(s.key);
        if (!key || !existing.has(key)) {
          const base = label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "STAGE";
          key = base;
          let n = 2;
          while (existing.has(key) || used.has(key)) key = `${base}_${n++}`;
        }
        if (used.has(key)) throw new HttpError(400, "Duplicate stage.");
        used.add(key);
        return { key, label, position: i + 1, active: s.active !== false, isFinal: s.isFinal === true };
      });
      if (!out.some((s) => s.active && s.isFinal)) throw new HttpError(400, "Mark at least one active stage as the final (completed) stage.");
      const old = await getStages();
      for (const s of out)
        await db.insert(workflowStages).values(s).onConflictDoUpdate({ target: workflowStages.key, set: { label: s.label, position: s.position, active: s.active, isFinal: s.isFinal } });
      await audit(db, { actor, action: "workflow_change", oldValue: old.map((s) => s.label).join(" → "), newValue: out.map((s) => s.label).join(" → ") });
      return { ok: true };
    }
    case "email": {
      const old = await getEmailSettings();
      const next: EmailSettings = {
        provider: (["smtp", "resend", "sendgrid", "ses"].includes(str(b.provider)) ? str(b.provider) : "smtp") as EmailSettings["provider"],
        host: str(b.host),
        port: int(b.port ?? DEFAULT_EMAIL.port, "SMTP port", 1, 65535),
        secure: b.secure === true,
        username: str(b.username),
        fromEmail: str(b.fromEmail),
        fromName: str(b.fromName) || DEFAULT_EMAIL.fromName,
        recipients: emails(b.recipients, "Recipients"),
        cc: emails(b.cc, "CC"),
        dailyEnabled: b.dailyEnabled === true,
        weeklyEnabled: b.weeklyEnabled === true,
        monthlyEnabled: b.monthlyEnabled === true,
        expiryEnabled: b.expiryEnabled === true,
        expiredEnabled: b.expiredEnabled === true,
        dailyTime: time(b.dailyTime, "Daily send time"),
        expiryTime: time(b.expiryTime, "Expiry alert time"),
        weeklyDay: int(b.weeklyDay, "Weekly day", 0, 6),
        reminderDays: [...new Set((Array.isArray(b.reminderDays) ? b.reminderDays : []).map((n) => int(n, "Reminder days", 0, 365)))].sort((a, c) => c - a),
        attachPdf: b.attachPdf === true,
        attachExcel: b.attachExcel === true,
      };
      if (next.fromEmail) emails([next.fromEmail], "From email");
      await setSetting("email", next, actor.id);
      // never log secrets — none are stored here
      await audit(db, { actor, action: "email_config_change", oldValue: old, newValue: next });
      return { ok: true };
    }
    case "validation": {
      const old = await getValidationSettings();
      const next = { caseSensitive: b.caseSensitive !== false };
      await setSetting("validation", next, actor.id);
      await audit(db, { actor, action: "validation_setting_change", oldValue: old, newValue: next });
      return { ok: true };
    }
    case "currency": {
      const cur = str(b.currency).toUpperCase();
      if (!/^[A-Z]{2,6}$/.test(cur)) throw new HttpError(400, "Currency must be 2–6 letters, e.g. UGX or USD.");
      await setSetting("currency", cur, actor.id);
      await audit(db, { actor, action: "currency_change", newValue: cur });
      return { ok: true };
    }
    case "permissions": {
      const m = (b.matrix ?? {}) as Record<string, unknown>;
      const old = await getPermissionMatrix();
      const clean = (v: unknown): Permission[] => (Array.isArray(v) ? v.filter((p): p is Permission => ALL_PERMISSIONS.includes(p as Permission) && !ADMIN_ONLY.includes(p as Permission)) : []);
      const next = { staff: clean(m.staff), viewer: clean(m.viewer) };
      await setSetting("permissions", next, actor.id);
      await audit(db, { actor, action: "user_permission_change", fieldName: "Role permissions", oldValue: { staff: old.staff, viewer: old.viewer }, newValue: next });
      return { ok: true };
    }
    default:
      throw new HttpError(404, "Unknown settings section");
  }
});

// keep asc import used (stage ordering handled in lib)
void asc;
