"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Card, Empty, ErrorBox, ExpiryBadge, ExportMenu, Loading, PageHeader, Stat, TableWrap, tdCls, thCls, useApi } from "@/components/ui";
import { fmtDate } from "@/lib/time";
import type { ExpiryRow } from "@/lib/records";
import { IconArrowRight, IconMoveRight } from "@/components/icons";

interface Dash {
  cards: Record<string, number>;
  workflow: { key: string; label: string; isFinal: boolean; count: number }[];
  upcoming: ExpiryRow[];
}

const FILTERS: [string, string][] = [
  ["all", "All"],
  ["expired", "Expired"],
  ["critical", "Critical"],
  ["expiring_soon", "Expiring soon"],
  ["active", "Active"],
];
const PILL: Record<string, string> = { all: "bg-blue-600 text-white", expired: "bg-red-600 text-white", critical: "bg-orange-500 text-white", expiring_soon: "bg-amber-500 text-white", active: "bg-emerald-600 text-white" };

export default function Dashboard() {
  const { data, loading, error } = useApi<Dash>("/api/dashboard");
  const [status, setStatus] = useState("all");
  const [doc, setDoc] = useState("");
  const [company, setCompany] = useState("");
  const [showAll, setShowAll] = useState(false);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox>{error ?? "Failed to load"}</ErrorBox>;
  const c = data.cards;

  const companies = [...new Set(data.upcoming.map((e) => e.companyName).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  const byDoc = data.upcoming.filter((e) => (!doc || e.doc === doc) && (!company || e.companyName === company));
  const count = (s: string) => (s === "all" ? byDoc.length : byDoc.filter((e) => e.status === s).length);
  const rows = byDoc.filter((e) => status === "all" || e.status === status);
  const visible = showAll ? rows : rows.slice(0, 25);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live overview of records, expiries and workflow" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Total Records" value={c.total} href="/records" />
        <Stat label="Today" value={c.today} tone="blue" href="/records" />
        <Stat label="This Month" value={c.thisMonth} tone="blue" href="/reports" />
        <Stat label="Pending" value={c.pending + c.inProgress} tone="amber" href="/records?processing=pending" />
        <Stat label="Completed" value={c.completed} tone="green" href="/records?processing=completed" />
        <Stat label="Expiring Soon" value={c.expiringSoon} tone="amber" href="/records?expiry=expiring_soon" />
        <Stat label="Critical" value={c.critical} tone="orange" href="/records?expiry=critical" />
        <Stat label="Expired" value={c.expired} tone="red" href="/records?expiry=expired" />
        <Stat label="Validation Errors" value={c.validationErrors} tone="red" href="/errors" />
        <Stat label="Errors Today" value={c.errorsToday} tone="purple" href="/errors" />
      </div>

      <Card title="Workflow" className="mt-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
          {data.workflow.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-center gap-2">
              <Link
                href={`/records?stage=${s.key}`}
                className={`flex-1 rounded-xl border p-3 text-center transition hover:shadow ${s.isFinal ? "border-emerald-200 bg-emerald-50" : "border-blue-100 bg-blue-50"}`}
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{s.label}</div>
                <div className={`text-2xl font-bold ${s.isFinal ? "text-emerald-700" : "text-blue-700"}`}>{s.count}</div>
              </Link>
              {i < data.workflow.length - 1 && (
                <span className="hidden text-slate-300 md:block">
                  <IconMoveRight size={18} />
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card
        title={`Upcoming expiries — most urgent first (${rows.length})`}
        className="mt-5"
        actions={
          <>
            <select value={company} onChange={(e) => { setCompany(e.target.value); setShowAll(false); }} className="max-w-[200px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium">
              <option value="">All companies</option>
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={doc} onChange={(e) => { setDoc(e.target.value); setShowAll(false); }} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium">
              <option value="">All documents</option><option value="IM7">IM7</option><option value="IM4">IM4</option><option value="EXIT">Exit</option>
            </select>
            <ExportMenu type="expiry" params={{ company, doc, status: status === "all" ? "" : status }} />
            <Link href="/expiry" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
              Full monitor <IconArrowRight size={13} />
            </Link>
          </>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {FILTERS.map(([k, l]) => (
            <button
              key={k}
              onClick={() => { setStatus(k); setShowAll(false); }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${status === k ? PILL[k] : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {l} <span className="ml-1 opacity-80">{count(k)}</span>
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <Empty>No documents match.</Empty>
        ) : (
          <>
            <TableWrap>
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr>
                    {["Company Name", "Document", "Number", "Container", "Invoice", "Issue date", "Expiry", "Days remaining", "Status", "Stage"].map((h) => (
                      <th key={h} className={thCls}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((e) => (
                    <tr key={e.recordId + e.doc} className="hover:bg-slate-50">
                      <td className={`${tdCls} font-medium`}>{e.companyName ?? "—"}</td>
                      <td className={tdCls}><Badge tone="blue">{e.doc === "EXIT" ? "Exit" : e.doc}</Badge></td>
                      <td className={`${tdCls} font-mono`}><Link className="font-semibold text-blue-700 hover:underline" href={`/records/${e.recordId}`}>{e.number}</Link></td>
                      <td className={`${tdCls} font-mono`}>{e.containerNo}</td>
                      <td className={tdCls}>{e.invoiceNo}</td>
                      <td className={tdCls}>{fmtDate(e.issueDate)}</td>
                      <td className={`${tdCls} font-medium`}>{fmtDate(e.expiryDate)}</td>
                      <td className={`${tdCls} text-base font-bold ${e.daysRemaining < 0 ? "text-red-600" : ""}`}>{e.daysRemaining}</td>
                      <td className={tdCls}><ExpiryBadge status={e.status} /></td>
                      <td className={tdCls}>{e.stage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {rows.length > 25 && (
              <div className="mt-3 text-center">
                <button onClick={() => setShowAll((v) => !v)} className="text-sm font-semibold text-blue-600 hover:underline">
                  {showAll ? "Show fewer" : `Show all ${rows.length}`}
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
