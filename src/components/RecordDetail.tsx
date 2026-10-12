"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RecordView } from "@/lib/records";
import RecordDocuments from "./RecordDocuments";
import { fmtDate, fmtDateTime } from "@/lib/time";
import { DOC_INFO, DOC_TYPES, NEXT_STEP_LABEL } from "@/lib/validation";
import { ACTION_LABEL, describeAudit } from "./format";
import MovePanel from "./MovePanel";
import RecordForm from "./RecordForm";
import TransportEditor from "./TransportEditor";
import { PaymentModal, PaymentsTable } from "./Payments";
import { PAY_LABEL, PAY_TONE, payStatus, r2, type PaymentRow } from "@/lib/payments-shared";
import { fmtMoney } from "./format";
import { ApiError, apiFetch, Badge, Btn, Card, Empty, ErrorBox, ExpiryBadge, Field, inputCls, Loading, Modal, ProcBadge, TableWrap, tdCls, thCls, useApi, useSession, useUI } from "./ui";
import { IconAlertTriangle, IconArchive, IconArrowLeft, IconCreditCard, IconMail, IconPauseCircle, IconPencil, IconPlus, IconTruck } from "./icons";

interface Detail {
  agent: { id: number | null; name: string; status: string } | null;
  record: RecordView;
  stops: Partial<Record<"IM7" | "IM4" | "EXIT", { at: string; by: string | null; toLabel: string }>>;
  history: { id: number; previousLabel: string | null; newLabel: string; movedByName: string | null; movedByPosition: string | null; movedAt: string; remarks: string | null }[];
  audit: { id: number; action: string; userName: string | null; fieldName: string | null; oldValue: string | null; newValue: string | null; reason: string | null; createdAt: string }[];
  errors: { id: number; fieldName: string; enteredValue: string | null; errorMessage: string; createdAt: string; resolved: boolean }[];
  emails: { id: number; label: string | null; recipient: string; status: string; createdAt: string }[];
  currency?: string;
  payments?: PaymentRow[];
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
    <span className="text-slate-500">{k}</span>
    <span className="text-right font-medium text-slate-900">{v}</span>
  </div>
);

export default function RecordDetail({ id }: { id: number }) {
  const { data, loading, error, reload } = useApi<Detail>(`/api/records/${id}`);
  const { can } = useSession();
  const { toast, confirm } = useUI();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editT, setEditT] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [dlg, setDlg] = useState<"archive" | "delete" | null>(null);
  const [reason, setReason] = useState("");

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox>{error ?? "Not found"}</ErrorBox>;
  const r = data.record;
  const paid = r2((data.payments ?? []).reduce((a, p) => a + p.amount, 0));
  const tTotal = r.transport?.total ?? 0;
  const pStatus = payStatus(tTotal, paid);

  async function archive(flag: boolean) {
    try {
      await apiFetch(`/api/records/${id}/archive`, { method: "POST", json: { archive: flag, reason } });
      toast(flag ? "Record archived." : "Record restored.");
      setDlg(null);
      setReason("");
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed", "error");
    }
  }
  async function del() {
    if (!(await confirm({ title: "Permanently delete?", message: "This cannot be undone. The deletion (with a snapshot of the record) is written to the audit log.", danger: true, confirmText: "Delete permanently" }))) return;
    try {
      await apiFetch(`/api/records/${id}`, { method: "DELETE", json: { reason } });
      toast("Record deleted.");
      router.push("/records");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed", "error");
    }
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/records" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
            <IconArrowLeft size={13} /> All records
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Invoice {r.invoiceNo}</h1>
          <p className="font-mono text-sm text-slate-600">Container {r.containerNo}</p>
          {r.companyName && <p className="text-sm font-medium text-slate-700">{r.companyName}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="blue">{r.stageLabel}</Badge>
            <ProcBadge p={r.processing} />
            <ExpiryBadge status={r.worstStatus} />
            {r.archived && <Badge tone="slate">Archived</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("records.edit") && !r.archived && (
            <Btn variant="secondary" onClick={() => setEditing(true)}>
              <IconPencil size={15} /> Edit
            </Btn>
          )}
          {can("records.archive") &&
            (r.archived ? (
              <Btn variant="secondary" onClick={() => setDlg("archive")}>
                <IconArchive size={15} /> Restore
              </Btn>
            ) : (
              <Btn variant="secondary" onClick={() => setDlg("archive")}>
                <IconArchive size={15} /> Archive
              </Btn>
            ))}
          {can("records.delete") && r.archived && <Btn variant="danger" onClick={() => setDlg("delete")}>Delete permanently</Btn>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Record information">
          <Row k="Invoice" v={r.invoiceNo} />
          <Row k="Container" v={<span className="font-mono">{r.containerNo}</span>} />
          <Row k="Company Name" v={r.companyName ?? "—"} />
          <Row
            k="C&F Agent"
            v={data.agent ? (
              <span>{data.agent.name} {data.agent.status === "blocked" && <Badge tone="red">Blocked</Badge>}{data.agent.status === "deleted" && <Badge tone="slate">Deleted</Badge>}</span>
            ) : <span className="text-red-600">Not set — edit the record to select one</span>}
          />
          <Row k="VA" v={r.va ?? "—"} />
          <Row k="Record date" v={fmtDate(r.recordDate)} />
          <Row k="Created by" v={r.createdByName ?? "—"} />
          <Row k="Position" v={r.createdByPosition ?? "—"} />
          {r.createdByEmail && <Row k="Account" v={<span className="text-xs">{r.createdByEmail}</span>} />}
          <Row k="Created at" v={fmtDateTime(r.createdAt)} />
          <Row k="Remarks" v={r.remarks ?? "—"} />
          {r.archived && <Row k="Archive reason" v={r.archiveReason ?? "—"} />}
        </Card>
        <Card title="Workflow">
          <Row k="Current stage" v={r.stageLabel} />
          <Row k="Next step" v={r.isFinal ? "Completed" : NEXT_STEP_LABEL[r.status] ?? r.status} />
          <Row k="Processing" v={<ProcBadge p={r.processing} />} />
          <Row k="Expiry status" v={<ExpiryBadge status={r.worstStatus} />} />
        </Card>
        <Card title="Expiry">
          {DOC_TYPES.map((d) => {
            const dv = r.docs[d];
            if (dv.stopped) return <Row key={d} k={DOC_INFO[d].label} v={<span className="text-slate-500">Stopped — moved on <Badge tone="slate">Not counted</Badge></span>} />;
            return <Row key={d} k={DOC_INFO[d].label} v={dv.daysRemaining === null ? "—" : <span>{dv.daysRemaining < 0 ? `${-dv.daysRemaining} days overdue` : `${dv.daysRemaining} days left`} <ExpiryBadge status={dv.status} /></span>} />;
          })}
        </Card>
      </div>

      <Card title="Documents" className="mt-5 !p-0">
        <TableWrap>
          <table className="w-full min-w-[800px]">
            <thead><tr>{["Document", "Number", "Issue date", "Validity used", "Expiry", "Days remaining", "Status", "Calculated at"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {DOC_TYPES.map((d) => {
                const dv = r.docs[d];
                return (
                  <tr key={d}>
                    <td className={`${tdCls} font-semibold`}>{DOC_INFO[d].label}</td>
                    <td className={`${tdCls} font-mono`}>{dv.number ?? "—"}</td>
                    <td className={tdCls}>{fmtDate(dv.issueDate)}</td>
                    <td className={tdCls}>{dv.validityDays ? `${dv.validityDays} days` : "—"}</td>
                    <td className={`${tdCls} font-semibold`}>{fmtDate(dv.expiryDate)}</td>
                    <td className={tdCls}>{dv.stopped ? <span className="text-slate-400">—</span> : dv.daysRemaining ?? "—"}</td>
                    <td className={tdCls}>
                      {dv.stopped ? (
                        <span>
                          <Badge tone="slate">
                            <span className="inline-flex items-center gap-1">
                              <IconPauseCircle size={12} /> Countdown stopped
                            </span>
                          </Badge>
                          {data.stops[d] && <div className="mt-0.5 text-[11px] text-slate-500">Moved to {data.stops[d]!.toLabel} on {fmtDateTime(data.stops[d]!.at)}{data.stops[d]!.by ? ` by ${data.stops[d]!.by}` : ""}</div>}
                        </span>
                      ) : (
                        <ExpiryBadge status={dv.status} />
                      )}
                    </td>
                    <td className={tdCls}>{fmtDateTime(dv.calculatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
        <p className="px-4 py-2 text-xs text-slate-500">Validity and expiry are stored when calculated. Later changes to Expiry Rules never alter these historical values. When the record moves past a document’s stage (IM7 / S, IM4 / C, Exit / X), that document’s countdown stops and it no longer appears in expiry alerts.</p>
      </Card>

      <Card title="Uploaded files" className="mt-5">
        <RecordDocuments recordId={r.id} archived={r.archived} />
      </Card>

      {can("transport.manage") && r.transport && (
        <Card
          className="mt-5 border-purple-200"
          title={<span className="inline-flex items-center gap-2"><IconTruck size={16} /> Transport &amp; charges <Badge tone="purple">Administrator only</Badge></span>}
          actions={<Btn small variant="secondary" onClick={() => setEditT(true)}><IconPencil size={14} /> Edit / delete</Btn>}
        >
          {!r.transport.transporter && r.transport.transportCost == null && r.transport.extraCharges == null ? (
            <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
              <span>No transport details recorded.</span>
              <Btn small onClick={() => setEditT(true)}><IconPlus size={15} /> Add transport details</Btn>
            </div>
          ) : (
            <div className="grid gap-x-8 md:grid-cols-2">
              <div>
                <Row k="Transporter" v={r.transport.transporter ?? "—"} />
                <Row k={`Transport cost (${data.currency})`} v={fmtMoney(r.transport.transportCost)} />
                <Row k={`Extra charges (${data.currency})`} v={<span className={r.transport.extraCharges ? "text-orange-600" : ""}>{fmtMoney(r.transport.extraCharges)}</span>} />
                <Row k={`Total (${data.currency})`} v={<b className="text-blue-700">{fmtMoney(r.transport.total)}</b>} />
                <Row k={`Paid (${data.currency})`} v={<span className="text-emerald-700">{fmtMoney(paid)}</span>} />
                <Row k={`Balance (${data.currency})`} v={<span><b className={tTotal - paid > 0 ? "text-red-600" : ""}>{fmtMoney(r2(tTotal - paid))}</b> <Badge tone={PAY_TONE[pStatus]}>{PAY_LABEL[pStatus]}</Badge></span>} />
              </div>
              <div className="py-2 text-sm">
                <div className="text-slate-500">Reason for the charges</div>
                <div className="mt-1 whitespace-pre-wrap font-medium text-slate-900">{r.transport.chargesReason ?? "—"}</div>
              </div>
            </div>
          )}
        </Card>
      )}

      {can("transport.manage") && r.transport && (r.transport.transporter || (data.payments?.length ?? 0) > 0) && (
        <Card
          className="mt-5 border-emerald-200"
          title={<span className="inline-flex items-center gap-2"><IconCreditCard size={16} /> Payments to transporter <Badge tone="purple">Administrator only</Badge></span>}
          actions={r.transport.transporter ? <Btn small variant="success" onClick={() => setPayOpen(true)}><IconPlus size={15} /> Record payment</Btn> : undefined}
        >
          <PaymentsTable rows={data.payments ?? []} currency={data.currency ?? ""} transporters={r.transport.transporter ? [r.transport.transporter] : []} onChanged={reload} showRecord={false} />
        </Card>
      )}
      {payOpen && r.transport?.transporter && (
        <PaymentModal
          currency={data.currency ?? ""}
          transporters={[r.transport.transporter]}
          preset={{ transporter: r.transport.transporter, recordId: r.id, lockRecord: true }}
          onClose={() => setPayOpen(false)}
          onSaved={() => { setPayOpen(false); reload(); }}
        />
      )}

      {can("records.move") && !r.archived && (
        <Card title="Moved to next step?" className="mt-5">
          <MovePanel record={r} onMoved={reload} />
        </Card>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Stage history (permanent)">
          <ol className="relative ml-2 space-y-4 border-l-2 border-blue-100 pl-5">
            {data.history.map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-500" />
                <div className="text-xs text-slate-500">{fmtDateTime(h.movedAt)} · {h.movedByName ?? "System"}{h.movedByPosition ? ` (${h.movedByPosition})` : ""}</div>
                <div className="text-sm font-medium text-slate-800">
                  {h.previousLabel ? <>Moved from <b>{h.previousLabel}</b> → <b>{h.newLabel}</b></> : <>Record Created <span className="text-slate-500">({h.newLabel})</span></>}
                </div>
                {h.remarks && <div className="text-xs text-slate-500">“{h.remarks}”</div>}
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Audit trail">
          {data.audit.length === 0 ? <Empty /> : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {data.audit.map((a) => (
                <li key={a.id} className="py-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-slate-800">{ACTION_LABEL[a.action] ?? a.action}</span>
                    <span className="text-xs text-slate-400">{fmtDateTime(a.createdAt)} · {a.userName}</span>
                  </div>
                  <div className="text-xs text-slate-600">{describeAudit(a)}</div>
                  {a.reason && a.action !== "validation_failure" && <div className="text-xs italic text-slate-500">Reason: {a.reason}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {data.errors.length > 0 && (
        <Card title="Validation errors for this record" className="mt-5">
          <ul className="space-y-1 text-sm">
            {data.errors.map((e) => (
              <li key={e.id} className="flex items-start gap-1.5">
                <IconAlertTriangle size={14} className="mt-0.5 shrink-0 text-red-500" />
                <span><b>{e.fieldName}</b> “{e.enteredValue}” — {e.errorMessage} <span className="text-xs text-slate-400">{fmtDateTime(e.createdAt)}</span> {e.resolved && <Badge tone="green">Resolved</Badge>}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {data.emails.length > 0 && (
        <Card title="Email notifications" className="mt-5">
          <ul className="space-y-1 text-sm">
            {data.emails.map((e) => (
              <li key={e.id} className="flex items-start gap-1.5">
                <IconMail size={14} className="mt-0.5 shrink-0 text-slate-400" />
                <span>{e.label} → {e.recipient} <Badge tone={e.status === "sent" ? "green" : "red"}>{e.status}</Badge> <span className="text-xs text-slate-400">{fmtDateTime(e.createdAt)}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editing && (
        <Modal title="Edit record" onClose={() => setEditing(false)}>
          <RecordForm mode="edit" record={r} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />
        </Modal>
      )}
      {editT && r.transport && (
        <TransportEditor
          recordId={r.id}
          label={`${r.invoiceNo} / ${r.containerNo}`}
          initial={r.transport}
          currency={data.currency ?? ""}
          onClose={() => setEditT(false)}
          onSaved={() => { setEditT(false); reload(); }}
        />
      )}
      {dlg && (
        <Modal title={dlg === "delete" ? "Permanently delete record" : r.archived ? "Restore record" : "Archive record"} onClose={() => setDlg(null)} small>
          <Field label="Reason" required hint={dlg === "archive" && r.archived ? "Optional" : "Recorded in the audit log."}>
            <textarea className={inputCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setDlg(null)}>Cancel</Btn>
            {dlg === "delete" ? <Btn variant="danger" onClick={del} disabled={!reason.trim()}>Delete…</Btn> : <Btn onClick={() => archive(!r.archived)} disabled={!r.archived && !reason.trim()}>{r.archived ? "Restore" : "Archive"}</Btn>}
          </div>
        </Modal>
      )}
    </>
  );
}
