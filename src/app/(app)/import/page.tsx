"use client";
import { useState } from "react";
import { fmtDate } from "@/lib/time";
import type { FieldError } from "@/lib/validation";
import { ApiError, apiFetch, Badge, Btn, Card, Empty, PageHeader, inputCls, TableWrap, tdCls, thCls, useUI } from "@/components/ui";

type Row = Record<string, string>;
interface Result {
  index: number;
  errors: FieldError[];
  duplicates: { id: number; matchedOn: string[] }[];
  fileDuplicate: boolean;
  expiry: Record<string, string | null>;
}
interface Preview { results: Result[]; summary: { total: number; valid: number; invalid: number; duplicates: number } }

const COLS: [string, string][] = [["invoiceNo", "Invoice No."], ["containerNo", "Container No."], ["companyName", "Company Name"], ["agentName", "C&F Agent"], ["im7No", "IM7 No."], ["va", "VA"], ["im4No", "IM4 No."], ["exitNo", "Exit No."], ["recordDate", "Record Date"]];

export default function ImportPage() {
  const { toast, confirm } = useUI();
  const [rows, setRows] = useState<Row[]>([]);
  const [prev, setPrev] = useState<Preview | null>(null);
  const [mode, setMode] = useState("valid_only");
  const [dupes, setDupes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function validate(r: Row[]) {
    try {
      setPrev(await apiFetch<Preview>("/api/import", { method: "POST", json: { rows: r } }));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Validation failed", "error");
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setDone(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiFetch<{ rows: Row[] }>("/api/import/parse", { method: "POST", body: fd });
      setRows(r.rows);
      if (!r.rows.length) toast("The file has no data rows.", "error");
      else await validate(r.rows);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!(await confirm({ title: "Import records?", message: `${prev?.summary.valid} valid row(s) will be imported${dupes ? ` plus ${prev?.summary.duplicates} duplicate(s)` : ""}. Invalid rows are rejected and logged in the Error Log.`, confirmText: "Import" }))) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ imported: number; skippedInvalid: number; skippedDuplicates: number; failed: unknown[] }>("/api/import", { method: "POST", json: { rows, commit: true, mode, importDuplicates: dupes } });
      setDone(`Imported ${r.imported} record(s). Skipped ${r.skippedInvalid} invalid and ${r.skippedDuplicates} duplicate row(s).${r.failed.length ? ` ${r.failed.length} failed.` : ""}`);
      toast(`Imported ${r.imported} record(s).`);
      setRows([]);
      setPrev(null);
    } catch (e) {
      if (e instanceof ApiError && e.data?.results) setPrev({ results: e.data.results, summary: e.data.summary });
      toast(e instanceof ApiError ? e.message : "Import failed", "error");
    } finally {
      setBusy(false);
    }
  }
  const edit = (i: number, k: string, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const remove = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    setRows(next);
    if (next.length) void validate(next);
    else setPrev(null);
  };
  const cellErr = (res: Result | undefined, k: string) => res?.errors.find((e) => e.field === k || (k === "agentName" && e.field === "agentId"));

  return (
    <>
      <PageHeader title="Excel Import" subtitle="Upload .xlsx / .xls / .csv with columns: Invoice No., Container No., Company Name, C&F Agent (must match an active agent), IM7 No., VA, IM4 No., Exit No., Record Date" />
      <Card title="1. Upload file">
        <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} className={inputCls} />
        {done && <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">✓ {done}</div>}
      </Card>

      {prev && (
        <>
          <Card title="2. Preview & correct" className="mt-5" actions={<Btn small variant="secondary" onClick={() => validate(rows)}>Re-validate</Btn>}>
            <div className="mb-3 flex flex-wrap gap-2 text-sm">
              <Badge tone="slate">{prev.summary.total} rows</Badge><Badge tone="green">{prev.summary.valid} valid</Badge>
              <Badge tone="red">{prev.summary.invalid} invalid</Badge><Badge tone="amber">{prev.summary.duplicates} possible duplicates</Badge>
            </div>
            <TableWrap>
              <table className="w-full min-w-[1000px]">
                <thead><tr><th className={thCls}>#</th>{COLS.map(([, l]) => <th key={l} className={thCls}>{l}</th>)}<th className={thCls}>IM7 Exp.</th><th className={thCls}>IM4 Exp.</th><th className={thCls}>Exit Exp.</th><th className={thCls}>Result</th><th className={thCls} /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => {
                    const res = prev.results[i];
                    const bad = !!res?.errors.length;
                    const dup = !bad && (res?.duplicates.length || res?.fileDuplicate);
                    return (
                      <tr key={i} className={bad ? "bg-red-50/50" : dup ? "bg-amber-50/50" : ""}>
                        <td className={tdCls}>{i + 1}</td>
                        {COLS.map(([k]) => (
                          <td key={k} className="px-1 py-1.5">
                            <input value={r[k] ?? ""} onChange={(e) => edit(i, k, e.target.value)} onBlur={() => validate(rows)} title={cellErr(res, k)?.message} className={`w-full min-w-[110px] rounded border px-2 py-1.5 text-sm ${cellErr(res, k) ? "border-red-500 bg-red-50" : "border-slate-200"}`} />
                          </td>
                        ))}
                        {["IM7", "IM4", "EXIT"].map((d) => <td key={d} className={tdCls}>{res?.expiry[d] ? fmtDate(res.expiry[d]) : "—"}</td>)}
                        <td className={`${tdCls} text-xs`}>
                          {bad ? <span className="font-medium text-red-700">{res.errors.map((e) => e.message).join(" ")}</span>
                            : dup ? <span className="text-amber-700">Possible duplicate{res.duplicates[0] ? ` of #${res.duplicates[0].id} (${res.duplicates[0].matchedOn.join(", ")})` : " within file"}</span>
                            : <span className="text-emerald-700">✓ Valid</span>}
                        </td>
                        <td className={tdCls}><button className="text-slate-400 hover:text-red-600" onClick={() => remove(i)} aria-label="Remove row">✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          </Card>
          <Card title="3. Import" className="mt-5">
            <div className="flex flex-wrap items-center gap-4">
              <select className={`${inputCls} max-w-xs`} value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="valid_only">Import valid rows only (skip invalid)</option>
                <option value="all_or_nothing">All or nothing (cancel if any row is invalid)</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={dupes} onChange={(e) => setDupes(e.target.checked)} /> Also import possible duplicates</label>
              <Btn onClick={commit} disabled={busy || (prev.summary.valid === 0 && !(dupes && prev.summary.duplicates))}>Import now</Btn>
            </div>
          </Card>
        </>
      )}
      {!prev && !done && <div className="mt-5"><Empty>Choose a file to begin. Every row is validated (IM7 → S, IM4 → C, Exit → X), checked for duplicates, and expiry dates are calculated before anything is saved.</Empty></div>}
    </>
  );
}
