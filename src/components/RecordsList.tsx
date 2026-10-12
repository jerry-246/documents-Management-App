"use client";
import Link from "next/link";
import { useState } from "react";
import type { RecordView } from "@/lib/records";
import { fmtDate } from "@/lib/time";
import { EXPIRY_LABEL } from "@/lib/validation";
import { Badge, Btn, Card, Empty, ErrorBox, ExpiryBadge, ExportMenu, Field, inputCls, Loading, PageHeader, Pager, ProcBadge, qs, TableWrap, tdCls, thCls, useApi, useConfig, useDebounced, useSession } from "./ui";

import { IconPlus } from "./icons";

type Init = Record<string, string | undefined>;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function RecordsList({ initial }: { initial: Init }) {
  const cfg = useConfig();
  const { can } = useSession();
  const [f, setF] = useState<Record<string, string>>({
    q: initial.q ?? "", stage: initial.stage ?? "", processing: initial.processing ?? "", expiry: initial.expiry ?? "", doc: initial.doc ?? "",
    user: "", from: "", to: "", month: "", year: "", invoice: "", container: "", company: "", agent: initial.agent ?? "", archived: "0", transporter: "",
  });
  const [withT, setWithT] = useState(false);
  const [page, setPage] = useState(1);
  const dq = useDebounced(f.q);
  const dInv = useDebounced(f.invoice);
  const dCont = useDebounced(f.container);
  const isAdmin = can("transport.manage");
  const dComp = useDebounced(f.company);
  const params = { ...f, q: dq, invoice: dInv, container: dCont, company: dComp };
  const { data, loading, error } = useApi<{ rows: RecordView[]; total: number; pageSize: number }>(`/api/records?${qs({ ...params, page, pageSize: 25 })}`);
  const users = useApi<{ rows: { id: number; name: string }[] }>("/api/users?options=1");
  const agentList = useApi<{ rows: { id: number; name: string; status: string }[] }>("/api/agents?options=1&all=1");
  const set = (k: string, v: string) => {
    setF((s) => ({ ...s, [k]: v }));
    setPage(1);
  };
  const clear = () => {
    setF({ q: "", stage: "", processing: "", expiry: "", doc: "", user: "", from: "", to: "", month: "", year: "", invoice: "", container: "", company: "", agent: "", archived: "0", transporter: "" });
    setPage(1);
  };
  const year = new Date().getFullYear();

  return (
    <>
      <PageHeader
        title="Records"
        subtitle="Search, filter and export all container records"
        actions={
          <>
            {isAdmin && (
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <input type="checkbox" checked={withT} onChange={(e) => setWithT(e.target.checked)} /> Include transport columns
              </label>
            )}
            <ExportMenu type="records" params={{ ...params, withTransport: isAdmin && withT ? "1" : "" }} />
            {can("records.create") && (
              <Link href="/records/new" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"><IconPlus size={16} /> New Record</Link>
            )}
          </>
        }
      />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div className="sm:col-span-2">
            <Field label="Search">
              <input className={inputCls} placeholder="Invoice, container, company, agent, IM7, VA, IM4, Exit, date, stage…" value={f.q} onChange={(e) => set("q", e.target.value)} />
            </Field>
          </div>
          {isAdmin && <Field label="Transporter"><input className={inputCls} value={f.transporter} onChange={(e) => set("transporter", e.target.value)} /></Field>}
          <Field label="Invoice"><input className={inputCls} value={f.invoice} onChange={(e) => set("invoice", e.target.value)} /></Field>
          <Field label="Container"><input className={inputCls} value={f.container} onChange={(e) => set("container", e.target.value)} /></Field>
          <Field label="Company"><input className={inputCls} value={f.company} onChange={(e) => set("company", e.target.value)} /></Field>
          <Field label="C&F Agent">
            <select className={inputCls} value={f.agent} onChange={(e) => set("agent", e.target.value)}>
              <option value="">All agents</option>
              {agentList.data?.rows.map((a) => <option key={a.id} value={a.id}>{a.name}{a.status === "blocked" ? " (blocked)" : ""}</option>)}
            </select>
          </Field>
          <Field label="Stage">
            <select className={inputCls} value={f.stage} onChange={(e) => set("stage", e.target.value)}>
              <option value="">All stages</option>
              {cfg?.stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={inputCls} value={f.processing} onChange={(e) => set("processing", e.target.value)}>
              <option value="">All</option><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option>
            </select>
          </Field>
          <Field label="Expiry status">
            <select className={inputCls} value={f.expiry} onChange={(e) => set("expiry", e.target.value)}>
              <option value="">Any</option>
              {Object.entries(EXPIRY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Document">
            <select className={inputCls} value={f.doc} onChange={(e) => set("doc", e.target.value)}>
              <option value="">Any</option><option value="IM7">IM7</option><option value="IM4">IM4</option><option value="EXIT">Exit</option>
            </select>
          </Field>
          <Field label="Created by">
            <select className={inputCls} value={f.user} onChange={(e) => set("user", e.target.value)}>
              <option value="">Anyone</option>
              {users.data?.rows.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="From date"><input type="date" className={inputCls} value={f.from} onChange={(e) => set("from", e.target.value)} /></Field>
          <Field label="To date"><input type="date" className={inputCls} value={f.to} onChange={(e) => set("to", e.target.value)} /></Field>
          <Field label="Month">
            <select className={inputCls} value={f.month} onChange={(e) => set("month", e.target.value)}>
              <option value="">Any</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
          <Field label="Year">
            <select className={inputCls} value={f.year} onChange={(e) => set("year", e.target.value)}>
              <option value="">Any</option>
              {[0, 1, 2, 3, 4].map((i) => <option key={i} value={year - i}>{year - i}</option>)}
            </select>
          </Field>
          {can("records.archive") && (
            <Field label="Archive">
              <select className={inputCls} value={f.archived} onChange={(e) => set("archived", e.target.value)}>
                <option value="0">Active only</option><option value="1">Archived only</option><option value="all">All</option>
              </select>
            </Field>
          )}
          <div className="flex items-end"><Btn variant="secondary" onClick={clear}>Clear filters</Btn></div>
        </div>
      </Card>

      {error && <ErrorBox>{error}</ErrorBox>}
      <Card className="!p-0">
        {loading && !data ? <Loading /> : !data?.rows.length ? <Empty>No records match these filters.</Empty> : (
          <TableWrap>
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr>{["Date", "Invoice", "Container", "Company Name", "C&F Agent", "IM7", "VA", "IM4", "Exit", "IM7 Expiry", "IM4 Expiry", "Stage", "Status", "Expiry", "Created by", ...(isAdmin ? ["Transporter"] : [])].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-blue-50/40">
                    <td className={tdCls}>{fmtDate(r.recordDate)}</td>
                    <td className={tdCls}>
                      <Link href={`/records/${r.id}`} className="font-semibold text-blue-700 hover:underline">{r.invoiceNo}</Link>
                      {r.archived && <span className="ml-1"><Badge tone="slate">Archived</Badge></span>}
                    </td>
                    <td className={`${tdCls} font-mono`}>{r.containerNo}</td>
                    <td className={`${tdCls} font-medium`}>{r.companyName ?? "—"}</td>
                    <td className={tdCls}>{r.agentName ?? <span className="text-xs text-red-500">Not set</span>}</td>
                    <td className={`${tdCls} font-mono`}>{r.im7No ?? "—"}</td>
                    <td className={tdCls}>{r.va ?? "—"}</td>
                    <td className={`${tdCls} font-mono`}>{r.im4No ?? "—"}</td>
                    <td className={`${tdCls} font-mono`}>{r.exitNo ?? "—"}</td>
                    <td className={tdCls}>{fmtDate(r.im7ExpiryDate)}</td>
                    <td className={tdCls}>{fmtDate(r.im4ExpiryDate)}</td>
                    <td className={tdCls}><Badge tone="blue">{r.stageLabel}</Badge></td>
                    <td className={tdCls}><ProcBadge p={r.processing} /></td>
                    <td className={tdCls}><ExpiryBadge status={r.worstStatus} /></td>
                    <td className={tdCls}>
                      <div className="whitespace-nowrap">{r.createdByName ?? "—"}</div>
                      {r.createdByPosition && <div className="whitespace-nowrap text-[11px] text-slate-500">{r.createdByPosition}</div>}
                    </td>
                    {isAdmin && <td className={`${tdCls} font-medium`}>{r.transport?.transporter ?? "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      {data && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </>
  );
}
