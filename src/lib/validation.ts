// Shared validation + expiry logic. Used by the browser (instant feedback) AND by the
// backend (final authority). Never import server-only modules here.
import { addDays, isISODate } from "./time";

export type DocType = "IM7" | "IM4" | "EXIT";
export const DOC_TYPES: DocType[] = ["IM7", "IM4", "EXIT"];

export const DOC_INFO: Record<
  DocType,
  { label: string; prefix: string; field: "im7No" | "im4No" | "exitNo"; format: string }
> = {
  IM7: { label: "IM7", prefix: "S", field: "im7No", format: "SXXXXXXXX" },
  IM4: { label: "IM4", prefix: "C", field: "im4No", format: "CXXXXXXXX" },
  EXIT: { label: "Exit", prefix: "X", field: "exitNo", format: "XXXXXXXXX" },
};

/** Workflow stage each document belongs to. Once a record moves PAST this stage, the document's expiry stops counting. */
export const DOC_STAGE: Record<DocType, string> = { IM7: "IM7", IM4: "IM4", EXIT: "EXIT" };

/** true when the record's current stage is after the document's own stage */
export function docStopped(doc: DocType, currentPos: number | undefined, posOf: (key: string) => number | undefined): boolean {
  const p = posOf(DOC_STAGE[doc]);
  return currentPos !== undefined && p !== undefined && currentPos > p;
}

export interface FieldError {
  field: string;
  label: string;
  value: string;
  expected: string;
  message: string;
}

export function docMessage(doc: DocType): string {
  const i = DOC_INFO[doc];
  return `Invalid ${i.label} Number. ${i.label} numbers must start with "${i.prefix}".`;
}

/** Returns null when valid (or empty — documents are optional until issued). */
export function validateDocNumber(
  doc: DocType,
  raw: string | null | undefined,
  caseSensitive = true,
): FieldError | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const i = DOC_INFO[doc];
  const expected = `Required format: ${i.format}`;
  const base = { field: i.field as string, label: i.label, value, expected };
  const first = value[0];
  const okPrefix = caseSensitive ? first === i.prefix : first.toUpperCase() === i.prefix;
  if (!okPrefix) return { ...base, message: docMessage(doc) };
  if (value.length < 2)
    return { ...base, message: `Invalid ${i.label} Number. Enter the full number after the "${i.prefix}" prefix.` };
  if (value.length > 40 || !/^[A-Za-z0-9\-/_.]+$/.test(value))
    return { ...base, message: `Invalid ${i.label} Number. Use letters, digits, "-", "/", "_" or "." only (max 40 characters).` };
  return null;
}

export interface RecordFields {
  invoiceNo?: string | null;
  containerNo?: string | null;
  im7No?: string | null;
  va?: string | null;
  im4No?: string | null;
  exitNo?: string | null;
  recordDate?: string | null;
  im7IssueDate?: string | null;
  im4IssueDate?: string | null;
  exitIssueDate?: string | null;
}

export function validateRecordFields(i: RecordFields, opts: { caseSensitive: boolean }): FieldError[] {
  const errs: FieldError[] = [];
  const req = (field: string, label: string, v?: string | null) => {
    if (!(v ?? "").trim())
      errs.push({ field, label, value: "", expected: "Required", message: `${label} is required.` });
  };
  req("invoiceNo", "Invoice No.", i.invoiceNo);
  req("containerNo", "Container No.", i.containerNo);
  if (!isISODate(i.recordDate))
    errs.push({ field: "recordDate", label: "Record Date", value: i.recordDate ?? "", expected: "YYYY-MM-DD", message: "Record Date must be a valid date." });
  for (const d of DOC_TYPES) {
    const e = validateDocNumber(d, i[DOC_INFO[d].field], opts.caseSensitive);
    if (e) errs.push(e);
  }
  const issues: [string, string, string | null | undefined][] = [
    ["im7IssueDate", "IM7 Issue Date", i.im7IssueDate],
    ["im4IssueDate", "IM4 Issue Date", i.im4IssueDate],
    ["exitIssueDate", "Exit Issue Date", i.exitIssueDate],
  ];
  for (const [f, l, v] of issues)
    if (v && !isISODate(v))
      errs.push({ field: f, label: l, value: v, expected: "YYYY-MM-DD", message: `${l} must be a valid date.` });
  return errs;
}

// ---------- Expiry ----------
export type ExpiryStatus = "active" | "expiring_soon" | "critical" | "expired";

export interface ExpiryRule {
  documentType: DocType;
  validityDays: number;
  warning1Days: number; // "expiring soon" threshold
  warning2Days: number;
  warning3Days: number; // "critical" threshold
  active: boolean;
}

export function calcExpiry(issueDate: string, validityDays: number): string {
  return addDays(issueDate, validityDays);
}

export function expiryStatusFor(
  daysRemaining: number,
  rule?: Pick<ExpiryRule, "warning1Days" | "warning3Days">,
): ExpiryStatus {
  if (daysRemaining < 0) return "expired";
  if (daysRemaining <= (rule?.warning3Days ?? 3)) return "critical";
  if (daysRemaining <= (rule?.warning1Days ?? 14)) return "expiring_soon";
  return "active";
}

export const EXPIRY_LABEL: Record<ExpiryStatus, string> = {
  active: "Active",
  expiring_soon: "Expiring Soon",
  critical: "Critical",
  expired: "Expired",
};

export const NEXT_STEP_STATUSES = ["pending", "in_progress", "completed", "not_applicable"] as const;
export const NEXT_STEP_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  not_applicable: "Not Applicable",
};
