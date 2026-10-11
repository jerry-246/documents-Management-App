"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtDate, todayISO } from "@/lib/time";
import { PAYMENT_METHODS, r2, type PaymentRow } from "@/lib/payments-shared";
import { fmtMoney } from "./format";
import { ApiError, apiFetch, Btn, Empty, Field, inputCls, Modal, TableWrap, tdCls, thCls, useUI } from "./ui";

interface ChargeRow { id: number; invoiceNo: string; containerNo: string; transporter: string | null; total: number; paid: number; balance: number }

export interface PaymentPreset {
  transporter?: string;
  recordId?: number | null;
  lockRecord?: boolean;
}

/** Record or edit a payment to a transporter (administrator only). */
export function PaymentModal({
  currency,
  transporters,
  preset,
  payment,
  onClose,
  onSaved,
}: {
  currency: string;
  transporters: string[];
  preset?: PaymentPreset;
  payment?: PaymentRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, confirm } = useUI();
  const [f, setF] = useState({
    transporter: payment?.transporter ?? preset?.transporter ?? "",
    recordId: payment ? (payment.recordId == null ? "" : String(payment.recordId)) : preset?.recordId ? String(preset.recordId) : "",
    amount: payment ? String(payment.amount) : "",
    paymentDate: payment?.paymentDate ?? todayISO(),
    method: payment?.method ?? "bank",
    reference: payment?.reference ?? "",
    notes: payment?.notes ?? "",
    reason: "",
  });
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    const t = f.transporter.trim();
    if (!t) {
      setCharges([]);
      return;
    }
    const h = setTimeout(() => {
      apiFetch<{ rows: ChargeRow[] }>(`/api/transport?archived=all&exact=1&transporter=${encodeURIComponent(t)}`)
        .then((d) => setCharges(d.rows))
        .catch(() => setCharges([]));
    }, 250);
    return () => clearTimeout(h);
  }, [f.transporter]);

  const sel = charges.find((c) => String(c.id) === f.recordId);
  const editingSame = payment && payment.recordId != null && String(payment.recordId) === f.recordId ? payment.amount : 0;
  const outstanding = sel ? r2(sel.balance + editingSame) : null;
  const transporterOwed = r2(charges.reduce((a, c) => a + c.balance, 0));
  const amt = Number(f.amount) || 0;
  const over = outstanding !== null && amt > outstanding;

  async function save() {
    if (over && !(await confirm({ title: "Payment is more than the balance", message: `The balance on this container is ${currency} ${fmtMoney(outstanding)}, but you are recording ${currency} ${fmtMoney(amt)}. It will show as overpaid. Continue?`, confirmText: "Record anyway" }))) return;
    setBusy(true);
    try {
      const body = { ...f, recordId: f.recordId ? Number(f.recordId) : null };
      if (payment) await apiFetch(`/api/transport/payments/${payment.id}`, { method: "PATCH", json: body });
      else await apiFetch("/api/transport/payments", { method: "POST", json: body });
      toast(payment ? "Payment updated." : "Payment recorded.");
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={payment ? `Edit payment #${payment.id}` : "Record payment to transporter"} onClose={onClose} small>
      <div className="space-y-3">
        <Field label="Transporter" required>
          <input className={inputCls} list="pay-transporters" value={f.transporter} disabled={!!preset?.lockRecord} onChange={(e) => setF((s) => ({ ...s, transporter: e.target.value, recordId: "" }))} autoFocus={!preset?.transporter} />
          <datalist id="pay-transporters">{transporters.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="For container" hint={f.transporter && !preset?.lockRecord ? `Total owed to this transporter: ${currency} ${fmtMoney(transporterOwed)}` : undefined}>
          <select className={inputCls} value={f.recordId} disabled={!!preset?.lockRecord} onChange={(e) => set("recordId", e.target.value)}>
            <option value="">General / lump-sum payment (not linked to one container)</option>
            {charges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.invoiceNo} / {c.containerNo} — balance {currency} {fmtMoney(c.balance)}
              </option>
            ))}
            {preset?.recordId && !charges.some((c) => c.id === preset.recordId) && <option value={preset.recordId}>Record #{preset.recordId}</option>}
          </select>
        </Field>
        {sel && (
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2.5 text-xs">
            <div><div className="text-slate-500">Total charges</div><b>{fmtMoney(sel.total)}</b></div>
            <div><div className="text-slate-500">Already paid</div><b>{fmtMoney(r2(sel.paid - editingSame))}</b></div>
            <div><div className="text-slate-500">Outstanding</div><b className="text-orange-600">{fmtMoney(outstanding)}</b></div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Amount (${currency})`} required error={over ? "More than the outstanding balance." : undefined}>
            <div className="flex gap-1">
              <input type="number" min={0} step="0.01" inputMode="decimal" className={inputCls} value={f.amount} onChange={(e) => set("amount", e.target.value)} />
              {outstanding !== null && outstanding > 0 && (
                <button type="button" onClick={() => set("amount", String(outstanding))} className="shrink-0 rounded-lg px-2 text-xs font-semibold text-blue-600 ring-1 ring-slate-300 hover:bg-blue-50">
                  Full
                </button>
              )}
            </div>
          </Field>
          <Field label="Payment date" required>
            <input type="date" className={inputCls} value={f.paymentDate} onChange={(e) => set("paymentDate", e.target.value)} />
          </Field>
          <Field label="Method">
            <select className={inputCls} value={f.method} onChange={(e) => set("method", e.target.value)}>
              {Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Reference / receipt no.">
            <input className={inputCls} value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder="e.g. TXN123, cheque no." />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className={inputCls} rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        {payment && (
          <Field label="Reason for editing" hint="Recorded in the admin audit trail.">
            <input className={inputCls} value={f.reason} onChange={(e) => set("reason", e.target.value)} />
          </Field>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="success" onClick={save} disabled={busy || !f.transporter.trim() || !(amt > 0)}>
          {busy ? "Saving…" : payment ? "Save changes" : "Record payment"}
        </Btn>
      </div>
    </Modal>
  );
}

/** Payments list with edit / delete (administrator only). */
export function PaymentsTable({
  rows,
  currency,
  transporters,
  onChanged,
  showRecord = true,
}: {
  rows: PaymentRow[];
  currency: string;
  transporters: string[];
  onChanged: () => void;
  showRecord?: boolean;
}) {
  const { toast } = useUI();
  const [edit, setEdit] = useState<PaymentRow | null>(null);
  const [del, setDel] = useState<PaymentRow | null>(null);
  const [reason, setReason] = useState("");

  async function remove() {
    if (!del) return;
    try {
      await apiFetch(`/api/transport/payments/${del.id}`, { method: "DELETE", json: { reason } });
      toast("Payment deleted.");
      setDel(null);
      setReason("");
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed", "error");
    }
  }

  if (!rows.length) return <Empty>No payments recorded.</Empty>;
  return (
    <>
      <TableWrap>
        <table className="w-full min-w-[900px]">
          <thead>
            <tr>
              {["Date", "Transporter", ...(showRecord ? ["Container"] : []), `Amount (${currency})`, "Method", "Reference", "Notes", "Recorded by", ""].map((h) => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((p) => (
              <tr key={p.id} className="align-top hover:bg-slate-50">
                <td className={`${tdCls} whitespace-nowrap`}>{fmtDate(p.paymentDate)}</td>
                <td className={`${tdCls} font-medium`}>{p.transporter}</td>
                {showRecord && (
                  <td className={tdCls}>
                    {p.recordId ? (
                      <Link href={`/records/${p.recordId}`} className="text-blue-700 hover:underline">{p.invoiceNo} / <span className="font-mono">{p.containerNo}</span></Link>
                    ) : (
                      <span className="text-xs italic text-slate-500">General payment</span>
                    )}
                  </td>
                )}
                <td className={`${tdCls} text-right font-bold tabular-nums text-emerald-700`}>{fmtMoney(p.amount)}</td>
                <td className={tdCls}>{PAYMENT_METHODS[p.method] ?? p.method}</td>
                <td className={`${tdCls} text-xs`}>{p.reference ?? "—"}</td>
                <td className={`${tdCls} max-w-xs text-xs`}>{p.notes ?? "—"}</td>
                <td className={`${tdCls} text-xs`}>{p.createdByName ?? "—"}</td>
                <td className={`${tdCls} whitespace-nowrap`}>
                  <Btn small variant="secondary" onClick={() => setEdit(p)}>Edit</Btn>{" "}
                  <Btn small variant="ghost" className="!text-red-600" onClick={() => setDel(p)}>Delete</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {edit && <PaymentModal currency={currency} transporters={transporters} payment={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged(); }} />}
      {del && (
        <Modal title="Delete payment" onClose={() => setDel(null)} small>
          <p className="mb-3 text-sm text-slate-600">
            Delete the payment of <b>{currency} {fmtMoney(del.amount)}</b> to <b>{del.transporter}</b> on {fmtDate(del.paymentDate)}? The balance owed will go back up. A copy stays in the admin audit trail.
          </p>
          <Field label="Reason" required>
            <textarea className={inputCls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice by mistake" />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setDel(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={remove} disabled={!reason.trim()}>Delete payment</Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
