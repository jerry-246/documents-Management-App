import { db } from "@/db";
import { expiryRules, systemSettings, workflowStages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { DOC_TYPES, type DocType, type ExpiryRule } from "./validation";
import { ADMIN_ONLY, DEFAULT_PERMISSIONS, type Permission, type Role } from "./perms";

const cache = new Map<string, { at: number; v: unknown }>();
const TTL = 10_000;

export async function getSetting<T>(name: string, fallback: T): Promise<T> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < TTL) return hit.v as T;
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.settingName, name)).limit(1);
  let v: T = fallback;
  if (row) {
    try {
      v = JSON.parse(row.settingValue) as T;
    } catch {
      v = fallback;
    }
  }
  cache.set(name, { at: Date.now(), v });
  return v;
}

export async function setSetting(name: string, value: unknown, userId: number | null) {
  const str = JSON.stringify(value);
  await db
    .insert(systemSettings)
    .values({ settingName: name, settingValue: str, updatedBy: userId })
    .onConflictDoUpdate({
      target: systemSettings.settingName,
      set: { settingValue: str, updatedBy: userId, updatedAt: new Date() },
    });
  cache.delete(name);
}

// ---------- Email ----------
export interface EmailSettings {
  provider: "smtp" | "resend" | "sendgrid" | "ses";
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string;
  recipients: string[];
  cc: string[];
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  monthlyEnabled: boolean;
  expiryEnabled: boolean;
  expiredEnabled: boolean;
  dailyTime: string; // HH:mm Africa/Kampala
  expiryTime: string;
  weeklyDay: number; // 0=Sun
  reminderDays: number[];
  attachPdf: boolean;
  attachExcel: boolean;
}

export const DEFAULT_EMAIL: EmailSettings = {
  provider: "smtp",
  host: "",
  port: 587,
  secure: false,
  username: "",
  fromEmail: "",
  fromName: "Container Tracking System",
  recipients: [],
  cc: [],
  dailyEnabled: true,
  weeklyEnabled: true,
  monthlyEnabled: true,
  expiryEnabled: true,
  expiredEnabled: true,
  dailyTime: "17:00",
  expiryTime: "08:00",
  weeklyDay: 1,
  reminderDays: [14, 7, 3, 1],
  attachPdf: true,
  attachExcel: true,
};

export async function getEmailSettings(): Promise<EmailSettings> {
  const s = await getSetting<Partial<EmailSettings>>("email", {});
  return { ...DEFAULT_EMAIL, ...s };
}

/** The password / API key lives ONLY in environment secrets — never in the DB or frontend. */
export function emailSecret(): string {
  return process.env.SMTP_PASSWORD || process.env.EMAIL_API_KEY || "";
}

// ---------- Validation settings ----------
export async function getValidationSettings() {
  const s = await getSetting<{ caseSensitive?: boolean }>("validation", {});
  return { caseSensitive: s.caseSensitive ?? true };
}

// ---------- Expiry rules ----------
export const DEFAULT_RULES: Record<DocType, Omit<ExpiryRule, "documentType">> = {
  IM7: { validityDays: 180, warning1Days: 14, warning2Days: 7, warning3Days: 3, active: true },
  IM4: { validityDays: 14, warning1Days: 14, warning2Days: 7, warning3Days: 3, active: true },
  EXIT: { validityDays: 7, warning1Days: 7, warning2Days: 3, warning3Days: 1, active: true },
};

export async function getRules(): Promise<Record<DocType, ExpiryRule>> {
  const rows = await db.select().from(expiryRules);
  const out = {} as Record<DocType, ExpiryRule>;
  for (const d of DOC_TYPES) {
    const r = rows.find((x) => x.documentType === d);
    out[d] = r
      ? {
          documentType: d,
          validityDays: r.validityDays,
          warning1Days: r.warning1Days,
          warning2Days: r.warning2Days,
          warning3Days: r.warning3Days,
          active: r.active,
        }
      : { documentType: d, ...DEFAULT_RULES[d] };
  }
  return out;
}

// ---------- Workflow ----------
export interface Stage {
  key: string;
  label: string;
  position: number;
  active: boolean;
  isFinal: boolean;
}

export const DEFAULT_STAGES: Stage[] = [
  { key: "CREATED", label: "Record Created", position: 1, active: true, isFinal: false },
  { key: "IM7", label: "IM7 / S", position: 2, active: true, isFinal: false },
  { key: "VA", label: "VA", position: 3, active: true, isFinal: false },
  { key: "IM4", label: "IM4 / C", position: 4, active: true, isFinal: false },
  { key: "EXIT", label: "Exit / X", position: 5, active: true, isFinal: false },
  { key: "COMPLETED", label: "Completed", position: 6, active: true, isFinal: true },
];

export async function getStages(): Promise<Stage[]> {
  const rows = await db.select().from(workflowStages).orderBy(asc(workflowStages.position), asc(workflowStages.id));
  if (!rows.length) return DEFAULT_STAGES;
  return rows.map((r) => ({ key: r.key, label: r.label, position: r.position, active: r.active, isFinal: r.isFinal }));
}

// ---------- Permissions ----------
export async function getPermissionMatrix(): Promise<Record<Role, Permission[]>> {
  const s = await getSetting<Partial<Record<Role, Permission[]>>>("permissions", {});
  const strip = (l?: Permission[]) => (l ?? []).filter((p) => !ADMIN_ONLY.includes(p));
  return {
    admin: DEFAULT_PERMISSIONS.admin,
    staff: strip(s.staff ?? DEFAULT_PERMISSIONS.staff),
    viewer: strip(s.viewer ?? DEFAULT_PERMISSIONS.viewer),
  };
}

export async function permissionsFor(role: Role): Promise<Permission[]> {
  if (role === "admin") return DEFAULT_PERMISSIONS.admin;
  return ((await getPermissionMatrix())[role] ?? []).filter((p) => !ADMIN_ONLY.includes(p));
}

export async function getCurrency(): Promise<string> {
  return getSetting<string>("currency", "UGX");
}
