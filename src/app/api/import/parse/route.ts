import * as XLSX from "xlsx";
import { HttpError, route } from "@/lib/api";
import { addDays } from "@/lib/time";

export const dynamic = "force-dynamic";

const HEADERS: Record<string, string> = {
  invoiceno: "invoiceNo", invoice: "invoiceNo", containerno: "containerNo", container: "containerNo",
  cfagent: "agentName", candfagent: "agentName", agent: "agentName", agentname: "agentName", clearingagent: "agentName",
  clearingandforwardingagent: "agentName", clearingforwardingagent: "agentName",
  companyname: "companyName", company: "companyName", client: "companyName", clientname: "companyName",
  im7no: "im7No", im7: "im7No", va: "va", im4no: "im4No", im4: "im4No", exitno: "exitNo", exit: "exitNo",
  recorddate: "recordDate", date: "recordDate",
};

function toISO(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return new Date(v.getTime() + 12 * 3600_000).toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return addDays("1899-12-30", Math.floor(v));
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; // dd/mm/yyyy
  return s;
}

export const POST = route("records.import", async ({ req }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Please choose an Excel or CSV file.");
  if (file.size > 5 * 1024 * 1024) throw new HttpError(400, "File is too large (max 5 MB).");
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: true });
  } catch {
    throw new HttpError(400, "Could not read this file. Use .xlsx, .xls or .csv.");
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new HttpError(400, "The file has no sheets.");
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
  if (raw.length > 2000) throw new HttpError(400, "Too many rows (max 2000 per import).");
  const rows = raw.map((r) => {
    const o: Record<string, string> = { invoiceNo: "", containerNo: "", companyName: "", agentName: "", im7No: "", va: "", im4No: "", exitNo: "", recordDate: "" };
    for (const [k, v] of Object.entries(r)) {
      const key = HEADERS[k.toLowerCase().replace(/[^a-z0-9]/g, "")];
      if (!key) continue;
      o[key] = key === "recordDate" ? toISO(v) : String(v ?? "").trim();
    }
    return o;
  });
  const known = new Set(Object.keys(raw[0] ?? {}).map((k) => HEADERS[k.toLowerCase().replace(/[^a-z0-9]/g, "")]).filter(Boolean));
  if (rows.length && !known.has("invoiceNo") && !known.has("containerNo"))
    throw new HttpError(400, "Columns not recognised. Expected: Invoice No., Container No., Company Name, C&F Agent, IM7 No., VA, IM4 No., Exit No., Record Date.");
  return { rows };
});
