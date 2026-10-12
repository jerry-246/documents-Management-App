"use client";
import Link from "next/link";
import { useState } from "react";
import type { ExpiryRow } from "@/lib/records";
import { fmtDate } from "@/lib/time";
import { EXPIRY_LABEL } from "@/lib/validation";
import { Badge, Card, Empty, ErrorBox, ExpiryBadge, ExportMenu, Field, inputCls, Loading, PageHeader, qs, TableWrap, tdCls, thCls, useApi } from "@/components/ui";

const PRESETS: [string, string][] = [["", "All"], ["today", "Today"], ["next3", "Next 3 days"], ["next7", "Next 7 days"], ["next14", "Next 14 days"], ["next30", "Next 30 days"], ["expired", "Expired"], ["custom", "Custom range"]];

export default function ExpiryPage() {
  const [preset, setPreset] = useState("");
  const [doc, setDoc] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [inc, setInc] = useState(false);
  const [company, setCompany] = useState("");
  const companies = useApi<{ rows: string[] }>("/api/records/companies");
  const p = { company, preset, doc, status, from: preset === "custom" ? from : "", to: preset === "custom" ? to : "", includeCompleted: inc ? "1" : "" };
  const { data, loading, error } = useApi<{ rows: ExpiryRow[] }>(`/api/expiry?${qs(p)}`);

  return (
    <>
      <PageHeader title="Expiry Monitoring" subtitle="Documents ordered by urgency. Status thresholds come from Settings &gt; Expiry Rules." actions={<ExportMenu type="expiry" params={p} />} />
      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {PRESETS.map(([k, l]) => (
            <button key={k} onClick={() => setPreset(k)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${preset === k ? (k === "expired" ? "bg-red-600 text-white" : "bg-blue-600 text-white") : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{l}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Company">
            <select className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">All companies</option>
              {companies.data?.rows.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Document">
            <select className={inputCls} value={doc} onChange={(e) => setDoc(e.target.value)}>
              <option value="">All documents</option><option value="IM7">IM7</option><option value="IM4">IM4</option><option value="EXIT">Exit</option>
            </select>
          </Field>
          <Field label="Status">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any</option>
              {Object.entries(EXPIRY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          {preset === "custom" && (
            <>
              <Field label="Expiry from"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="Expiry to"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            </>
          )}
          <label className="flex items-end gap-2 pb-2.5 text-sm text-slate-600"><input type="checkbox" checked={inc} onChange={(e) => setInc(e.target.checked)} /> Include completed records</label>
        </div>
      </Card>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card className="!p-0">
        {loading && !data ? <Loading /> : !data?.rows.length ? <Empty>No documents match.</Empty> : (
          <TableWrap>
            <table className="w-full min-w-[800px]">
              <thead><tr>{["Company Name", "Document", "Number", "Container", "Invoice", "Expiry", "Days remaining", "Status", "Stage"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((e) => (
                  <tr key={e.recordId + e.doc} className="hover:bg-slate-50">
                    <td className={`${tdCls} font-medium`}>{e.companyName ?? "—"}</td>
                    <td className={tdCls}><Badge tone="blue">{e.doc === "EXIT" ? "Exit" : e.doc}</Badge></td>
                    <td className={`${tdCls} font-mono`}><Link className="font-semibold text-blue-700 hover:underline" href={`/records/${e.recordId}`}>{e.number}</Link></td>
                    <td className={`${tdCls} font-mono`}>{e.containerNo}</td>
                    <td className={tdCls}>{e.invoiceNo}</td>
                    <td className={tdCls}>{fmtDate(e.expiryDate)}</td>
                    <td className={`${tdCls} text-base font-bold ${e.daysRemaining < 0 ? "text-red-600" : ""}`}>{e.daysRemaining}</td>
                    <td className={tdCls}><ExpiryBadge status={e.status} /></td>
                    <td className={tdCls}>{e.stage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
