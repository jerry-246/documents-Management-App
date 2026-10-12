"use client";
import { useState } from "react";
import { fmtDateTime } from "@/lib/time";
import { ApiError, apiFetch, Badge, Btn, Card, Empty, ErrorBox, ExportMenu, Field, inputCls, Loading, PageHeader, Pager, qs, TableWrap, tdCls, thCls, useApi, useDebounced, useSession, useUI } from "@/components/ui";

interface Em { id: number; label: string | null; recipient: string; subject: string; notificationType: string; status: string; errorMessage: string | null; retryCount: number; sentAt: string | null; createdAt: string }
const TYPE_LABEL: Record<string, string> = { daily_report: "Daily", weekly_report: "Weekly", monthly_report: "Monthly", expiry_reminder: "Expiry", critical_alert: "Expiry (critical)", expired: "Expired", test: "Test" };

export default function EmailsPage() {
  const { can } = useSession();
  const { toast } = useUI();
  const [f, setF] = useState({ q: "", status: "", type: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const p = { ...f, q: useDebounced(f.q) };
  const { data, loading, error, reload } = useApi<{ rows: Em[]; total: number; pageSize: number }>(`/api/emails?${qs({ ...p, page })}`);
  const set = (k: string, v: string) => { setF((s) => ({ ...s, [k]: v })); setPage(1); };
  async function retry(id: number) {
    try {
      await apiFetch(`/api/emails/${id}/retry`, { method: "POST" });
      toast("Email sent.");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Retry failed", "error");
    }
    reload();
  }
  return (
    <>
      <PageHeader title="Email History" subtitle="Every report and reminder email, including failures" actions={<ExportMenu type="emails" params={p} />} />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Search"><input className={inputCls} value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Recipient, subject…" /></Field>
          <Field label="Type">
            <select className={inputCls} value={f.type} onChange={(e) => set("type", e.target.value)}>
              <option value="">All</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="expiry">Expiry alerts</option><option value="test">Test</option>
            </select>
          </Field>
          <Field label="Status">
            <select className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="">All</option><option value="sent">Sent</option><option value="failed">Failed</option>
            </select>
          </Field>
          <Field label="From"><input type="date" className={inputCls} value={f.from} onChange={(e) => set("from", e.target.value)} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={f.to} onChange={(e) => set("to", e.target.value)} /></Field>
        </div>
      </Card>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card className="!p-0">
        {loading && !data ? <Loading /> : !data?.rows.length ? <Empty>No emails yet. Configure recipients and SMTP in Settings &gt; Email.</Empty> : (
          <TableWrap>
            <table className="w-full min-w-[900px]">
              <thead><tr>{["Date", "Recipient", "Report", "Subject", "Status", "Type", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((e) => (
                  <tr key={e.id} className="align-top hover:bg-slate-50">
                    <td className={`${tdCls} whitespace-nowrap`}>{fmtDateTime(e.sentAt ?? e.createdAt)}</td>
                    <td className={tdCls}>{e.recipient}</td>
                    <td className={tdCls}>{e.label}</td>
                    <td className={`${tdCls} max-w-xs text-xs`}>{e.subject}</td>
                    <td className={tdCls}>
                      <Badge tone={e.status === "sent" ? "green" : e.status === "failed" ? "red" : "amber"}>{e.status === "sent" ? "Sent" : e.status === "failed" ? "Failed" : "Pending"}</Badge>
                      {e.errorMessage && <div className="mt-1 max-w-xs text-xs text-red-600">{e.errorMessage}</div>}
                      {e.retryCount > 0 && <div className="text-xs text-slate-400">{e.retryCount} retr{e.retryCount === 1 ? "y" : "ies"}</div>}
                    </td>
                    <td className={tdCls}>{TYPE_LABEL[e.notificationType] ?? e.notificationType}</td>
                    <td className={tdCls}>{e.status === "failed" && can("emails.manage") && <Btn small variant="secondary" onClick={() => retry(e.id)}>Retry</Btn>}</td>
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
