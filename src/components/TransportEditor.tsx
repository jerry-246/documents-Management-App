"use client";
import { useState } from "react";
import { fmtMoney } from "./format";
import { ApiError, apiFetch, Btn, Field, inputCls, inputErrCls, Modal, useUI } from "./ui";

export interface TransportData {
  transporter: string | null;
  transportCost: number | null;
  extraCharges: number | null;
  chargesReason: string | null;
}

/** Administrator-only editor for transporter, transport cost, extra charges and the reason for them. */
export default function TransportEditor({
  recordId,
  label,
  initial,
  currency,
  transporters = [],
  onClose,
  onSaved,
}: {
  recordId: number;
  label: string;
  initial: TransportData;
  currency: string;
  transporters?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, confirm } = useUI();
  const [f, setF] = useState({
    transporter: initial.transporter ?? "",
    transportCost: initial.transportCost == null ? "" : String(initial.transportCost),
    extraCharges: initial.extraCharges == null ? "" : String(initial.extraCharges),
    chargesReason: initial.chargesReason ?? "",
  });
  const [busy, setBusy] = useState(false);
  const has = !!(initial.transporter || initial.transportCost != null || initial.extraCharges != null || initial.chargesReason);
  const cost = Number(f.transportCost) || 0;
  const extra = Number(f.extraCharges) || 0;
  const needReason = extra > 0 && !f.chargesReason.trim();

  async function save() {
    if (needReason) return toast("Please write the reason for the extra charges.", "error");
    setBusy(true);
    try {
      await apiFetch(`/api/records/${recordId}/transport`, { method: "PUT", json: f });
      toast("Transport details saved (recorded in the audit trail).");
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!(await confirm({ title: "Delete transport details?", message: "The transporter, cost, extra charges and reason will be removed from this record. The previous values stay in the (admin-only) audit trail.", danger: true, confirmText: "Delete" }))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/records/${recordId}/transport`, { method: "DELETE", json: { reason: "Deleted by administrator" } });
      toast("Transport details deleted.");
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Transport & charges — ${label}`} onClose={onClose} small>
      <div className="space-y-3">
        <Field label="Transporter">
          <input className={inputCls} list="transporter-list" value={f.transporter} onChange={(e) => setF({ ...f, transporter: e.target.value })} autoFocus />
          <datalist id="transporter-list">{transporters.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Transport cost (${currency})`}>
            <input type="number" min={0} step="0.01" inputMode="decimal" className={inputCls} value={f.transportCost} onChange={(e) => setF({ ...f, transportCost: e.target.value })} />
          </Field>
          <Field label={`Extra charges (${currency})`}>
            <input type="number" min={0} step="0.01" inputMode="decimal" className={inputCls} value={f.extraCharges} onChange={(e) => setF({ ...f, extraCharges: e.target.value })} />
          </Field>
        </div>
        <Field label="Reason for the charges" required={extra > 0} error={needReason ? "A reason is required when there are extra charges." : undefined} hint="e.g. waiting time, demurrage, fuel surcharge, border fees…">
          <textarea className={`${inputCls} ${needReason ? inputErrCls : ""}`} rows={3} value={f.chargesReason} onChange={(e) => setF({ ...f, chargesReason: e.target.value })} />
        </Field>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          Total: <b className="text-blue-700">{currency} {fmtMoney(cost + extra)}</b>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <div>{has && <Btn variant="danger" onClick={remove} disabled={busy}>Delete details</Btn>}</div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
