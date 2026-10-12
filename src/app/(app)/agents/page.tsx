"use client";
import Link from "next/link";
import { useState } from "react";
import { fmtDateTime } from "@/lib/time";
import { ApiError, apiFetch, Badge, Btn, Card, Empty, ErrorBox, Field, inputCls, Loading, Modal, PageHeader, qs, Stat, TableWrap, tdCls, thCls, useApi, useDebounced, useUI } from "@/components/ui";
import { IconPlus } from "@/components/icons";

interface Agent {
  id: number; name: string; licenseNo: string | null; tin: string | null; contactPerson: string | null; phone: string | null; email: string | null;
  address: string | null; notes: string | null; status: "active" | "blocked"; blockedReason: string | null; blockedAt: string | null; createdAt: string; records: number;
}
interface Data { rows: Agent[]; totals: { all: number; active: number; blocked: number } }

const EMPTY: Partial<Agent> = { name: "", licenseNo: "", tin: "", contactPerson: "", phone: "", email: "", address: "", notes: "" };

export default function AgentsPage() {
  const { toast } = useUI();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useApi<Data>(`/api/agents?${qs({ q: dq, status })}`);
  const [edit, setEdit] = useState<Partial<Agent> | null>(null);
  const [block, setBlock] = useState<Agent | null>(null);
  const [del, setDel] = useState<Agent | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : "Failed", "error");

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      if (edit.id) await apiFetch(`/api/agents/${edit.id}`, { method: "PATCH", json: edit });
      else await apiFetch("/api/agents", { method: "POST", json: edit });
      toast(edit.id ? "Agent updated." : "Agent created — it can now be selected on records.");
      setEdit(null);
      reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function setAgentStatus(a: Agent, next: "active" | "blocked") {
    setBusy(true);
    try {
      await apiFetch(`/api/agents/${a.id}`, { method: "PATCH", json: { status: next, reason } });
      toast(next === "blocked" ? `${a.name} is blocked.` : `${a.name} is active again.`);
      setBlock(null);
      setReason("");
      reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function remove() {
    if (!del) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ linkedRecords: number }>(`/api/agents/${del.id}`, { method: "DELETE", json: { reason } });
      toast(`${del.name} deleted.${r.linkedRecords ? ` ${r.linkedRecords} record(s) keep the agent name for history.` : ""}`);
      setDel(null);
      setReason("");
      reload();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  const input = (k: keyof Agent, label: string, opts: { required?: boolean; type?: string; span?: boolean; area?: boolean } = {}) => (
    <div className={opts.span ? "sm:col-span-2" : ""}>
      <Field label={label} required={opts.required}>
        {opts.area ? (
          <textarea className={inputCls} rows={2} value={(edit?.[k] as string) ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
        ) : (
          <input type={opts.type ?? "text"} className={inputCls} value={(edit?.[k] as string) ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
        )}
      </Field>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Clearing & Forwarding Agents"
        subtitle="Administrator only — agents listed here are the only ones staff can select on a record. Blocked agents cannot be selected."
        actions={<Btn onClick={() => setEdit({ ...EMPTY })}><IconPlus size={16} /> Add agent</Btn>}
      />
      {data && (
        <div className="mb-4 grid grid-cols-3 gap-3 md:max-w-xl">
          <Stat label="Agents" value={data.totals.all} />
          <Stat label="Active" value={data.totals.active} tone="green" />
          <Stat label="Blocked" value={data.totals.blocked} tone="red" />
        </div>
      )}
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2"><Field label="Search"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, licence, TIN, contact, phone, email…" /></Field></div>
          <Field label="Status">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option><option value="active">Active</option><option value="blocked">Blocked</option>
            </select>
          </Field>
        </div>
      </Card>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card className="!p-0">
        {loading && !data ? <Loading /> : !data?.rows.length ? (
          <Empty>No agents yet. Click “Add agent” — records cannot be saved until at least one active agent exists.</Empty>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[1000px]">
              <thead><tr>{["Agent", "Licence No.", "TIN", "Contact person", "Phone", "Email", "Records", "Status", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((a) => (
                  <tr key={a.id} className={`align-top hover:bg-slate-50 ${a.status === "blocked" ? "bg-red-50/40" : ""}`}>
                    <td className={`${tdCls} font-semibold`}>{a.name}{a.address && <div className="text-xs font-normal text-slate-500">{a.address}</div>}</td>
                    <td className={tdCls}>{a.licenseNo ?? "—"}</td>
                    <td className={tdCls}>{a.tin ?? "—"}</td>
                    <td className={tdCls}>{a.contactPerson ?? "—"}</td>
                    <td className={tdCls}>{a.phone ?? "—"}</td>
                    <td className={`${tdCls} text-xs`}>{a.email ?? "—"}</td>
                    <td className={tdCls}>{a.records ? <Link className="font-semibold text-blue-700 hover:underline" href={`/records?agent=${a.id}`}>{a.records}</Link> : 0}</td>
                    <td className={tdCls}>
                      {a.status === "active" ? <Badge tone="green">Active</Badge> : <Badge tone="red">Blocked</Badge>}
                      {a.status === "blocked" && a.blockedReason && <div className="mt-1 max-w-[200px] text-[11px] text-red-700">{a.blockedReason}<br /><span className="text-slate-400">{fmtDateTime(a.blockedAt)}</span></div>}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>
                      <Btn small variant="secondary" onClick={() => setEdit(a)}>Edit</Btn>{" "}
                      {a.status === "active" ? (
                        <Btn small variant="ghost" className="!text-orange-600" onClick={() => { setReason(""); setBlock(a); }}>Block</Btn>
                      ) : (
                        <Btn small variant="ghost" className="!text-emerald-700" onClick={() => setAgentStatus(a, "active")} disabled={busy}>Unblock</Btn>
                      )}{" "}
                      <Btn small variant="ghost" className="!text-red-600" onClick={() => { setReason(""); setDel(a); }}>Delete</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {edit && (
        <Modal title={edit.id ? `Edit agent — ${edit.name}` : "Add Clearing & Forwarding agent"} onClose={() => setEdit(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            {input("name", "Agent / company name", { required: true, span: true })}
            {input("licenseNo", "Licence No.")}
            {input("tin", "TIN")}
            {input("contactPerson", "Contact person")}
            {input("phone", "Phone", { type: "tel" })}
            {input("email", "Email", { type: "email", span: true })}
            {input("address", "Address", { span: true })}
            {input("notes", "Notes", { span: true, area: true })}
          </div>
          {edit.id && <p className="mt-3 text-xs text-slate-500">Renaming an agent also updates the name shown on its existing records. All changes are recorded in the audit log.</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setEdit(null)}>Cancel</Btn>
            <Btn onClick={save} disabled={busy || !edit.name?.trim()}>{busy ? "Saving…" : "Save agent"}</Btn>
          </div>
        </Modal>
      )}
      {block && (
        <Modal title={`Block ${block.name}`} onClose={() => setBlock(null)} small>
          <p className="mb-3 text-sm text-slate-600">A blocked agent disappears from the selection list and cannot be assigned to any new or edited record. Existing records keep the agent. You can unblock at any time.</p>
          <Field label="Reason for blocking" required>
            <textarea className={inputCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Licence expired, non-compliance…" />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setBlock(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => setAgentStatus(block, "blocked")} disabled={busy || !reason.trim()}>Block agent</Btn>
          </div>
        </Modal>
      )}
      {del && (
        <Modal title={`Delete ${del.name}`} onClose={() => setDel(null)} small>
          <p className="mb-3 text-sm text-slate-600">
            This permanently removes the agent from the system.
            {del.records > 0 && <> <b>{del.records} record(s)</b> use this agent — they will keep the name “{del.name}” for history, but it will be marked as deleted.</>}
            {" "}Consider <b>blocking</b> instead if you may need it again.
          </p>
          <Field label="Reason" required>
            <textarea className={inputCls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setDel(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={remove} disabled={busy || !reason.trim()}>Delete permanently</Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
