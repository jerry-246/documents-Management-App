"use client";
import Link from "next/link";
import { useState } from "react";
import { fmtDateTime } from "@/lib/time";
import { apiFetch, Badge, Btn, Card, Empty, ErrorBox, ExportMenu, Field, inputCls, Loading, PageHeader, Pager, qs, TableWrap, tdCls, thCls, useApi, useDebounced, useSession, useUI } from "@/components/ui";

interface Err { id: number; recordId: number | null; userName: string | null; invoiceNo: string | null; containerNo: string | null; fieldName: string; enteredValue: string | null; expectedFormat: string | null; errorMessage: string; source: string; ipAddress: string | null; resolved: boolean; createdAt: string }

export default function ErrorsPage() {
  const { can } = useSession();
  const { toast } = useUI();
  const [f, setF] = useState({ q: "", field: "", resolved: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const p = { ...f, q: useDebounced(f.q) };
  const { data, loading, error, reload } = useApi<{ rows: Err[]; total: number; pageSize: number }>(`/api/errors?${qs({ ...p, page })}`);
  const set = (k: string, v: string) => { setF((s) => ({ ...s, [k]: v })); setPage(1); };
  async function toggle(e: Err) {
    await apiFetch(`/api/errors/${e.id}`, { method: "PATCH", json: { resolved: !e.resolved } });
    toast(e.resolved ? "Re-opened." : "Marked as resolved.");
    reload();
  }
  return (
    <>
      <PageHeader title="Error Log" subtitle="Every rejected entry is recorded here with the value that was typed" actions={<ExportMenu type="errors" params={p} />} />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Search"><input className={inputCls} value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Invoice, container, value, user…" /></Field>
          <Field label="Field">
            <select className={inputCls} value={f.field} onChange={(e) => set("field", e.target.value)}>
              <option value="">All</option><option>IM7</option><option>IM4</option><option>Exit</option><option>Invoice No.</option><option>Container No.</option><option>Record Date</option>
            </select>
          </Field>
          <Field label="Resolution">
            <select className={inputCls} value={f.resolved} onChange={(e) => set("resolved", e.target.value)}>
              <option value="">All</option><option value="0">Open</option><option value="1">Resolved</option>
            </select>
          </Field>
          <Field label="From"><input type="date" className={inputCls} value={f.from} onChange={(e) => set("from", e.target.value)} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={f.to} onChange={(e) => set("to", e.target.value)} /></Field>
        </div>
      </Card>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card className="!p-0">
        {loading && !data ? <Loading /> : !data?.rows.length ? <Empty>No errors recorded.</Empty> : (
          <TableWrap>
            <table className="w-full min-w-[1000px]">
              <thead><tr>{["ID", "Date / time", "User", "Invoice", "Container", "Field", "Entered", "Expected", "Error", "Source / IP", "Status", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((e) => (
                  <tr key={e.id} className="align-top hover:bg-slate-50">
                    <td className={tdCls}>{e.id}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{fmtDateTime(e.createdAt)}</td>
                    <td className={tdCls}>{e.userName ?? "—"}</td>
                    <td className={tdCls}>{e.recordId ? <Link className="text-blue-700" href={`/records/${e.recordId}`}>{e.invoiceNo}</Link> : e.invoiceNo ?? "—"}</td>
                    <td className={`${tdCls} font-mono`}>{e.containerNo ?? "—"}</td>
                    <td className={tdCls}><Badge tone="red">{e.fieldName}</Badge></td>
                    <td className={`${tdCls} font-mono`}>{e.enteredValue || <i className="text-slate-400">empty</i>}</td>
                    <td className={`${tdCls} text-xs`}>{e.expectedFormat}</td>
                    <td className={`${tdCls} min-w-[220px] text-xs text-red-700`}>{e.errorMessage}</td>
                    <td className={`${tdCls} text-xs`}>{e.source}<br /><span className="text-slate-400">{e.ipAddress}</span></td>
                    <td className={tdCls}>{e.resolved ? <Badge tone="green">Resolved</Badge> : <Badge tone="red">Open</Badge>}</td>
                    <td className={tdCls}>{can("errors.resolve") && <Btn small variant="secondary" onClick={() => toggle(e)}>{e.resolved ? "Re-open" : "Resolve"}</Btn>}</td>
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
