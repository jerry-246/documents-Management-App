"use client";
import Link from "next/link";
import { useState } from "react";
import { fmtDateTime } from "@/lib/time";
import { ACTION_LABEL, trunc } from "@/components/format";
import { Card, Empty, ErrorBox, ExportMenu, Field, inputCls, Loading, PageHeader, Pager, qs, TableWrap, tdCls, thCls, useApi, useDebounced } from "@/components/ui";

interface A { id: number; userName: string | null; recordId: number | null; action: string; fieldName: string | null; oldValue: string | null; newValue: string | null; reason: string | null; createdAt: string }

export default function AuditPage() {
  const [f, setF] = useState({ q: "", action: "", user: "", recordId: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const p = { ...f, q: useDebounced(f.q) };
  const { data, loading, error } = useApi<{ rows: A[]; total: number; pageSize: number }>(`/api/audit?${qs({ ...p, page })}`);
  const users = useApi<{ rows: { id: number; name: string }[] }>("/api/users?options=1");
  const set = (k: string, v: string) => { setF((s) => ({ ...s, [k]: v })); setPage(1); };
  return (
    <>
      <PageHeader title="Audit Log" subtitle="Immutable trail of important actions" actions={<ExportMenu type="audit" params={p} />} />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Search"><input className={inputCls} value={f.q} onChange={(e) => set("q", e.target.value)} /></Field>
          <Field label="Action">
            <select className={inputCls} value={f.action} onChange={(e) => set("action", e.target.value)}>
              <option value="">All</option>
              {Object.entries(ACTION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="User">
            <select className={inputCls} value={f.user} onChange={(e) => set("user", e.target.value)}>
              <option value="">Anyone</option>
              {users.data?.rows.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Record ID"><input className={inputCls} value={f.recordId} onChange={(e) => set("recordId", e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="From"><input type="date" className={inputCls} value={f.from} onChange={(e) => set("from", e.target.value)} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={f.to} onChange={(e) => set("to", e.target.value)} /></Field>
        </div>
      </Card>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card className="!p-0">
        {loading && !data ? <Loading /> : !data?.rows.length ? <Empty>No audit entries.</Empty> : (
          <TableWrap>
            <table className="w-full min-w-[1000px]">
              <thead><tr>{["Date / time", "User", "Action", "Record", "Field", "Old value", "New value", "Reason"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((a) => (
                  <tr key={a.id} className="align-top hover:bg-slate-50">
                    <td className={`${tdCls} whitespace-nowrap`}>{fmtDateTime(a.createdAt)}</td>
                    <td className={tdCls}>{a.userName}</td>
                    <td className={`${tdCls} font-medium`}>{ACTION_LABEL[a.action] ?? a.action}</td>
                    <td className={tdCls}>{a.recordId ? <Link className="text-blue-700" href={`/records/${a.recordId}`}>#{a.recordId}</Link> : "—"}</td>
                    <td className={tdCls}>{a.fieldName ?? "—"}</td>
                    <td className={`${tdCls} max-w-[220px] break-words text-xs`}>{trunc(a.oldValue, 160) || "—"}</td>
                    <td className={`${tdCls} max-w-[220px] break-words text-xs`}>{trunc(a.newValue, 160) || "—"}</td>
                    <td className={`${tdCls} max-w-[220px] break-words text-xs`}>{trunc(a.reason, 160) || "—"}</td>
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
