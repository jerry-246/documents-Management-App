import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtDate } from "./time";
import { EXPIRY_LABEL, NEXT_STEP_LABEL } from "./validation";
import type { RecordView } from "./records";

export interface Col {
  key: string;
  header: string;
}
export type Row = Record<string, string | number | null | undefined>;

export function toCsv(cols: Col[], rows: Row[]): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "\uFEFF" + [cols.map((c) => q(c.header)).join(","), ...rows.map((r) => cols.map((c) => q(r[c.key])).join(","))].join("\r\n");
}

export function toXlsx(cols: Col[], rows: Row[], sheet = "Report"): Buffer {
  const data = rows.map((r) => Object.fromEntries(cols.map((c) => [c.header, r[c.key] ?? ""])));
  const ws = XLSX.utils.json_to_sheet(data, { header: cols.map((c) => c.header) });
  ws["!cols"] = cols.map((c) => ({ wch: Math.max(12, c.header.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function toPdf(title: string, cols: Col[], rows: Row[], lines: string[] = []): Buffer {
  const doc = new jsPDF({ orientation: cols.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(title, 40, 40);
  doc.setFontSize(9);
  let y = 58;
  for (const l of lines) {
    doc.text(l, 40, y);
    y += 13;
  }
  autoTable(doc, {
    head: [cols.map((c) => c.header)],
    body: rows.map((r) => cols.map((c) => String(r[c.key] ?? ""))),
    startY: y + 6,
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175] },
    margin: { left: 40, right: 40 },
  });
  return Buffer.from(doc.output("arraybuffer"));
}

export const RECORD_COLS: Col[] = [
  { key: "invoiceNo", header: "Invoice No." },
  { key: "containerNo", header: "Container No." },
  { key: "companyName", header: "Company Name" },
  { key: "agentName", header: "C&F Agent" },
  { key: "im7No", header: "IM7" },
  { key: "va", header: "VA" },
  { key: "im4No", header: "IM4" },
  { key: "im7Expiry", header: "IM7 Expiry" },
  { key: "im4Expiry", header: "IM4 Expiry" },
  { key: "exitNo", header: "Exit" },
  { key: "stage", header: "Current Stage" },
  { key: "nextStep", header: "Next Step" },
  { key: "expiryStatus", header: "Expiry Status" },
  { key: "createdBy", header: "Created By" },
  { key: "createdByPosition", header: "Position" },
  { key: "date", header: "Date" },
];

export function recordCols(withTransport: boolean, currency = ""): Col[] {
  if (!withTransport) return RECORD_COLS;
  const c = currency ? ` (${currency})` : "";
  return [
    ...RECORD_COLS,
    { key: "transporter", header: "Transporter" },
    { key: "transportCost", header: `Transport Cost${c}` },
    { key: "extraCharges", header: `Extra Charges${c}` },
    { key: "transportTotal", header: `Total Transport${c}` },
    { key: "chargesReason", header: "Reason for Charges" },
  ];
}

export function recordExportRows(views: RecordView[], withTransport = false): Row[] {
  return views.map((v) => ({
    ...(withTransport && v.transport
      ? {
          transporter: v.transport.transporter ?? "",
          transportCost: v.transport.transportCost ?? "",
          extraCharges: v.transport.extraCharges ?? "",
          transportTotal: v.transport.total,
          chargesReason: v.transport.chargesReason ?? "",
        }
      : {}),
    invoiceNo: v.invoiceNo,
    containerNo: v.containerNo,
    companyName: v.companyName ?? "",
    agentName: v.agentName ?? "",
    im7No: v.im7No ?? "",
    va: v.va ?? "",
    im4No: v.im4No ?? "",
    im7Expiry: v.im7ExpiryDate ? fmtDate(v.im7ExpiryDate) : "",
    im4Expiry: v.im4ExpiryDate ? fmtDate(v.im4ExpiryDate) : "",
    exitNo: v.exitNo ?? "",
    stage: v.stageLabel,
    nextStep: v.isFinal ? "Completed" : (NEXT_STEP_LABEL[v.status] ?? v.status),
    expiryStatus: v.worstStatus ? EXPIRY_LABEL[v.worstStatus] : "—",
    createdBy: v.createdByName ?? "",
    createdByPosition: v.createdByPosition ?? "",
    date: fmtDate(v.recordDate),
  }));
}
