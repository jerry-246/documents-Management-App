import { db } from "@/db";
import { audit } from "@/lib/audit";
import { HttpError, route } from "@/lib/api";
import { can } from "@/lib/auth";
import { recordCols, recordExportRows, toCsv, toPdf, toXlsx, type Col, type Row } from "@/lib/export";
import { listPayments, queryTransport, transporterBalances } from "@/lib/transport";
import { PAY_LABEL, PAYMENT_METHODS } from "@/lib/payments-shared";
import { getCurrency } from "@/lib/settings";
import { expiryRows, filtersFromParams, getCtx, queryRecords } from "@/lib/records";
import { queryAudit, queryEmails, queryErrors } from "@/lib/lists";
import { fmtDate, fmtDateTime } from "@/lib/time";
import { EXPIRY_LABEL, type DocType, type ExpiryStatus } from "@/lib/validation";
import type { Permission } from "@/lib/perms";

export const dynamic = "force-dynamic";

export const GET = route("reports.export", async ({ req, actor }) => {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "records";
  const isAdmin = actor.role === "admin";
  if (["transport", "payments", "balances"].includes(type) && !isAdmin) throw new HttpError(403, "Only administrators can export transport costs and payments.");
  const format = sp.get("format") ?? "xlsx";
  if (!["csv", "xlsx", "pdf"].includes(format)) throw new HttpError(400, "Unsupported format");
  const need: Record<string, Permission> = { errors: "errors.view", audit: "audit.view", emails: "emails.view", expiry: "expiry.view" };
  if (need[type] && !can(actor, need[type])) throw new HttpError(403, "You do not have permission to export this.");

  const all = new URLSearchParams(sp);
  all.set("all", "1");
  let cols: Col[] = recordCols(false);
  let rows: Row[] = [];
  let title = "Container Tracking – Records";
  if (type === "records") {
    const f = filtersFromParams(sp);
    f.pageSize = undefined;
    const withT = isAdmin && sp.get("withTransport") === "1";
    cols = recordCols(withT, withT ? await getCurrency() : "");
    rows = recordExportRows((await queryRecords(f, await getCtx(isAdmin))).rows, withT);
  } else if (type === "transport") {
    const t = await queryTransport(sp);
    const c = ` (${t.currency})`;
    title = "Container Tracking – Transport Charges & Payments";
    cols = [
      { key: "date", header: "Date" }, { key: "invoice", header: "Invoice No." }, { key: "container", header: "Container No." },
      { key: "company", header: "Company Name" }, { key: "transporter", header: "Transporter" }, { key: "cost", header: `Transport Cost${c}` }, { key: "extra", header: `Extra Charges${c}` },
      { key: "total", header: `Total${c}` }, { key: "paid", header: `Paid${c}` }, { key: "balance", header: `Balance${c}` },
      { key: "status", header: "Payment Status" }, { key: "reason", header: "Reason for Charges" }, { key: "stage", header: "Stage" },
    ];
    rows = t.rows.map((r) => ({
      date: fmtDate(r.recordDate), invoice: r.invoiceNo, container: r.containerNo, company: r.companyName ?? "", transporter: r.transporter ?? "",
      cost: r.transportCost ?? "", extra: r.extraCharges ?? "", total: r.total, paid: r.paid, balance: r.balance, status: PAY_LABEL[r.payStatus],
      reason: r.chargesReason ?? "", stage: r.archived ? `${r.stageLabel} (archived)` : r.stageLabel,
    }));
    rows.push({ date: "TOTAL", invoice: `${t.totals.count} record(s)`, cost: t.totals.cost, extra: t.totals.extra, total: t.totals.total, paid: t.totals.paid, balance: t.totals.balance });
  } else if (type === "payments") {
    const t = await listPayments(sp);
    const c = ` (${t.currency})`;
    title = "Container Tracking – Transporter Payments";
    cols = [
      { key: "date", header: "Payment Date" }, { key: "transporter", header: "Transporter" }, { key: "invoice", header: "Invoice No." },
      { key: "container", header: "Container No." }, { key: "amount", header: `Amount${c}` }, { key: "method", header: "Method" },
      { key: "reference", header: "Reference" }, { key: "notes", header: "Notes" }, { key: "by", header: "Recorded By" },
    ];
    rows = t.rows.map((r) => ({
      date: fmtDate(r.paymentDate), transporter: r.transporter, invoice: r.invoiceNo ?? "General payment", container: r.containerNo ?? "",
      amount: r.amount, method: PAYMENT_METHODS[r.method] ?? r.method, reference: r.reference ?? "", notes: r.notes ?? "", by: r.createdByName ?? "",
    }));
    rows.push({ date: "TOTAL", transporter: `${t.totals.count} payment(s)`, amount: t.totals.amount });
  } else if (type === "balances") {
    const t = await transporterBalances();
    const c = ` (${t.currency})`;
    title = "Container Tracking – Transporter Balances";
    cols = [
      { key: "transporter", header: "Transporter" }, { key: "records", header: "Containers" }, { key: "charged", header: `Total Charged${c}` },
      { key: "paid", header: `Total Paid${c}` }, { key: "balance", header: `Balance Owed${c}` }, { key: "status", header: "Status" },
      { key: "unpaid", header: "Containers with balance" }, { key: "payments", header: "Payments" }, { key: "last", header: "Last Payment" },
    ];
    rows = t.rows.map((r) => ({
      transporter: r.transporter, records: r.records, charged: r.charged, paid: r.paid, balance: r.balance, status: PAY_LABEL[r.status],
      unpaid: r.unpaidRecords, payments: r.payments, last: r.lastPayment ? fmtDate(r.lastPayment) : "",
    }));
    rows.push({ transporter: "TOTAL", charged: t.totals.charged, paid: t.totals.paid, balance: t.totals.balance });
  } else if (type === "expiry") {
    title = "Container Tracking – Expiry Monitoring";
    cols = [
      { key: "company", header: "Company Name" }, { key: "doc", header: "Document" }, { key: "number", header: "Number" }, { key: "containerNo", header: "Container" },
      { key: "invoiceNo", header: "Invoice" }, { key: "issue", header: "Issue Date" }, { key: "validity", header: "Validity (days)" },
      { key: "expiry", header: "Expiry" }, { key: "days", header: "Days Remaining" }, { key: "status", header: "Status" }, { key: "stage", header: "Stage" },
    ];
    const doc = sp.get("doc")?.toUpperCase();
    const st = sp.get("status");
    const list = await expiryRows({
      preset: sp.get("preset") || undefined,
      doc: doc && ["IM7", "IM4", "EXIT"].includes(doc) ? (doc as DocType) : undefined,
      status: st && ["active", "expiring_soon", "critical", "expired"].includes(st) ? (st as ExpiryStatus) : undefined,
      from: sp.get("from") || undefined, to: sp.get("to") || undefined, includeCompleted: sp.get("includeCompleted") === "1",
    company: sp.get("company") || undefined,
    });
    rows = list.map((e) => ({
      company: e.companyName ?? "", doc: e.doc, number: e.number, containerNo: e.containerNo, invoiceNo: e.invoiceNo, issue: fmtDate(e.issueDate),
      validity: e.validityDays, expiry: fmtDate(e.expiryDate), days: e.daysRemaining, status: EXPIRY_LABEL[e.status], stage: e.stage,
    }));
  } else if (type === "errors") {
    title = "Container Tracking – Error Log";
    cols = [
      { key: "id", header: "ID" }, { key: "at", header: "Date/Time" }, { key: "user", header: "User" }, { key: "invoice", header: "Invoice" },
      { key: "container", header: "Container" }, { key: "field", header: "Field" }, { key: "value", header: "Entered" },
      { key: "expected", header: "Expected" }, { key: "message", header: "Error" }, { key: "resolved", header: "Resolved" },
    ];
    rows = (await queryErrors(all)).rows.map((e) => ({
      id: e.id, at: fmtDateTime(e.createdAt), user: e.userName, invoice: e.invoiceNo, container: e.containerNo, field: e.fieldName,
      value: e.enteredValue, expected: e.expectedFormat, message: e.errorMessage, resolved: e.resolved ? "Yes" : "No",
    }));
  } else if (type === "audit") {
    title = "Container Tracking – Audit Log";
    cols = [
      { key: "at", header: "Date/Time" }, { key: "user", header: "User" }, { key: "action", header: "Action" }, { key: "record", header: "Record" },
      { key: "field", header: "Field" }, { key: "old", header: "Old Value" }, { key: "new", header: "New Value" }, { key: "reason", header: "Reason" },
    ];
    rows = (await queryAudit(all, isAdmin)).rows.map((a) => ({
      at: fmtDateTime(a.createdAt), user: a.userName, action: a.action, record: a.recordId, field: a.fieldName, old: a.oldValue, new: a.newValue, reason: a.reason,
    }));
  } else if (type === "emails") {
    title = "Container Tracking – Email History";
    cols = [
      { key: "at", header: "Date/Time" }, { key: "to", header: "Recipient" }, { key: "label", header: "Report" },
      { key: "status", header: "Status" }, { key: "type", header: "Type" }, { key: "error", header: "Error" },
    ];
    rows = (await queryEmails(all)).rows.map((e) => ({
      at: fmtDateTime(e.createdAt), to: e.recipient, label: e.label, status: e.status, type: e.notificationType, error: e.errorMessage,
    }));
  } else throw new HttpError(400, "Unknown export type");

  await audit(db, { actor, action: "export", newValue: `${type} (${format}) — ${rows.length} rows`, reason: sp.toString().slice(0, 300) });
  const name = `${type}-${new Date().toISOString().slice(0, 10)}.${format}`;
  let body: Uint8Array;
  let ct: string;
  if (format === "csv") {
    body = new TextEncoder().encode(toCsv(cols, rows));
    ct = "text/csv; charset=utf-8";
  } else if (format === "pdf") {
    body = new Uint8Array(toPdf(title, cols, rows, [`${rows.length} rows • exported by ${actor.name}`]));
    ct = "application/pdf";
  } else {
    body = new Uint8Array(toXlsx(cols, rows, type));
    ct = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return new Response(body as unknown as BodyInit, { headers: { "Content-Type": ct, "Content-Disposition": `attachment; filename="${name}"` } });
});
