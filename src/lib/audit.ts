import { db } from "@/db";
import { auditLogs, notifications, validationErrors } from "@/db/schema";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { FieldError } from "./validation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Exec = PgDatabase<any, any, any>;

export interface Actor {
  id: number;
  name: string;
  email: string;
  role: "admin" | "staff" | "viewer";
  position?: string | null;
  /** Effective permissions for this specific user (per-user overrides already applied). */
  permissions?: string[];
  ip?: string;
  ua?: string;
}

type Who = { id: number; name: string; ip?: string } | null | undefined;

export async function audit(
  exec: Exec,
  e: {
    actor?: Who;
    recordId?: number | null;
    action: string;
    fieldName?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
  },
) {
  const s = (v: unknown) => (v === undefined || v === null ? null : typeof v === "string" ? v : JSON.stringify(v));
  await exec.insert(auditLogs).values({
    userId: e.actor?.id ?? null,
    userName: e.actor?.name ?? "System",
    recordId: e.recordId ?? null,
    action: e.action,
    fieldName: e.fieldName ?? null,
    oldValue: s(e.oldValue),
    newValue: s(e.newValue),
    reason: e.reason ?? null,
    ipAddress: e.actor?.ip ?? null,
  });
}

/** Persist every validation failure in the Error Log (+ audit trail + in-app notification). */
export async function logValidationErrors(
  errors: FieldError[],
  actor: Actor | null,
  ctx: { recordId?: number | null; invoiceNo?: string; containerNo?: string; source: "form" | "edit" | "import" | "api" },
) {
  if (!errors.length) return;
  await db.insert(validationErrors).values(
    errors.map((e) => ({
      recordId: ctx.recordId ?? null,
      userId: actor?.id ?? null,
      userName: actor?.name ?? null,
      invoiceNo: ctx.invoiceNo || null,
      containerNo: ctx.containerNo || null,
      fieldName: e.label,
      enteredValue: e.value,
      expectedFormat: e.expected,
      errorMessage: e.message,
      source: ctx.source,
      ipAddress: actor?.ip ?? null,
      userAgent: actor?.ua?.slice(0, 250) ?? null,
    })),
  );
  await audit(db, {
    actor,
    recordId: ctx.recordId,
    action: "validation_failure",
    newValue: errors.map((e) => `${e.label}: "${e.value}"`).join("; "),
    reason: errors.map((e) => e.message).join(" "),
  });
  await db.insert(notifications).values({
    kind: "error",
    message: `Validation failed (${errors.map((e) => e.label).join(", ")}) — entered by ${actor?.name ?? "unknown"}${
      ctx.containerNo ? ` for container ${ctx.containerNo}` : ""
    }.`,
    link: "/errors",
  });
}
