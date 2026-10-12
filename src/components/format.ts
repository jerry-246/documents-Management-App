export const ACTION_LABEL: Record<string, string> = {
  record_created: "Record created",
  record_imported: "Record imported",
  record_edited: "Record edited",
  expiry_stopped: "Expiry countdown stopped",
  expiry_resumed: "Expiry countdown resumed",
  transport_edited: "Transport details edited",
  transport_payment_added: "Transporter payment recorded",
  transport_payment_edited: "Transporter payment edited",
  transport_payment_deleted: "Transporter payment deleted",
  transport_cleared: "Transport details deleted",
  transport_deleted: "Transport details deleted (record removed)",
  currency_change: "Currency change",
  expiry_recalculated: "Expiry recalculated",
  stage_moved: "Stage moved",
  validation_failure: "Validation failure",
  record_archived: "Record archived",
  record_restored: "Record restored",
  document_upload: "File uploaded",
  document_delete: "File deleted",
  record_deleted: "Record deleted",
  login: "Login",
  logout: "Logout",
  login_failed: "Failed login",
  user_created: "User created",
  user_permission_change: "Permission change",
  user_status_change: "User status change",
  user_details_change: "User details change",
  agent_created: "C&F agent created",
  agent_edited: "C&F agent edited",
  agent_blocked: "C&F agent blocked",
  agent_unblocked: "C&F agent unblocked",
  agent_deleted: "C&F agent deleted",
  user_password_reset: "Password reset",
  expiry_rule_change: "Expiry rule change",
  email_config_change: "Email configuration change",
  report_generated: "Report generated",
  report_skipped: "Report skipped",
  excel_import: "Excel import",
  export: "Export",
  email_test: "Test email",
  email_retry: "Email retry",
  workflow_change: "Workflow change",
  validation_setting_change: "Validation setting change",
  error_resolved: "Error resolved",
  error_reopened: "Error reopened",
};

export function actionIcon(a: string): string {
  if (a.startsWith("record_") && a !== "record_edited") return a === "record_archived" || a === "record_deleted" ? "archive" : "new";
  if (a === "record_edited" || a === "expiry_recalculated") return "edit";
  if (a === "stage_moved") return "move";
  if (a === "validation_failure" || a === "login_failed") return "error";
  if (a.startsWith("report") || a.startsWith("email")) return "mail";
  return "info";
}

export function trunc(s: string | null | undefined, n = 90): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function describeAudit(a: { action: string; fieldName?: string | null; oldValue?: string | null; newValue?: string | null; reason?: string | null }): string {
  switch (a.action) {
    case "record_edited":
    case "transport_edited":
    case "expiry_recalculated":
      return `${a.fieldName}: "${a.oldValue || "—"}" → "${a.newValue || "—"}"`;
    case "stage_moved":
      return `${a.oldValue} → ${a.newValue}`;
    case "expiry_stopped":
    case "expiry_resumed":
      return `${a.fieldName} (${a.oldValue}): ${a.newValue}`;
    case "validation_failure":
      return trunc(a.reason ?? a.newValue, 140);
    default:
      return trunc(a.newValue ?? a.reason, 140);
  }
}

export function csvList(v: string): string[] {
  return v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

export function fmtMoney(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
