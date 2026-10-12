"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RecordView } from "@/lib/records";
import { todayISO, fmtDate } from "@/lib/time";
import { calcExpiry, DOC_INFO, DOC_TYPES, NEXT_STEP_LABEL, NEXT_STEP_STATUSES, validateDocNumber, type DocType, type FieldError } from "@/lib/validation";
import { fmtMoney } from "./format";
import { ApiError, apiFetch, Btn, Card, Field, inputCls, inputErrCls, Loading, Modal, useConfig, useUI } from "./ui";
import { IconAlertTriangle } from "./icons";

interface Dup { id: number; invoiceNo: string; containerNo: string; im7No: string | null; im4No: string | null; recordDate: string; matchedOn: string[] }

const NO_KEY = { IM7: "im7No", IM4: "im4No", EXIT: "exitNo" } as const;
const ISSUE_KEY = { IM7: "im7IssueDate", IM4: "im4IssueDate", EXIT: "exitIssueDate" } as const;
type FormState = Record<string, string>;

export default function RecordForm({ mode, record, onSaved, onCancel }: { mode: "create" | "edit"; record?: RecordView; onSaved?: (id: number) => void; onCancel?: () => void }) {
  const cfg = useConfig();
  const { toast } = useUI();
  const router = useRouter();
  const today = todayISO();
  const [f, setF] = useState<FormState>(() => ({
    invoiceNo: record?.invoiceNo ?? "",
    containerNo: record?.containerNo ?? "",
    companyName: record?.companyName ?? "",
    agentId: record?.agentId ? String(record.agentId) : "",
    im7No: record?.im7No ?? "",
    va: record?.va ?? "",
    im4No: record?.im4No ?? "",
    exitNo: record?.exitNo ?? "",
    recordDate: record?.recordDate ?? today,
    im7IssueDate: record?.im7IssueDate ?? "",
    im4IssueDate: record?.im4IssueDate ?? "",
    exitIssueDate: record?.exitIssueDate ?? "",
    currentStage: record?.currentStage ?? "",
    status: record?.status ?? "pending",
    remarks: record?.remarks ?? "",
    transporter: "",
    transportCost: "",
    extraCharges: "",
    chargesReason: "",
    reason: "",
  }));
  const [auto, setAuto] = useState<Record<DocType, boolean>>(() => ({
    IM7: !record?.im7IssueDate || record.im7IssueDate === record.recordDate,
    IM4: !record?.im4IssueDate || record.im4IssueDate === record.recordDate,
    EXIT: !record?.exitIssueDate || record.exitIssueDate === record.recordDate,
  }));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverErrors, setServerErrors] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState(false);
  const [dups, setDups] = useState<Dup[] | null>(null);
  const [reasonNeeded, setReasonNeeded] = useState(false);
  const [again, setAgain] = useState(false);
  const [companies, setCompanies] = useState<string[]>([]);
  const [agentList, setAgentList] = useState<{ id: number; name: string }[] | null>(null);
  useEffect(() => {
    apiFetch<{ rows: string[] }>("/api/records/companies").then((d) => setCompanies(d.rows)).catch(() => {});
    apiFetch<{ rows: { id: number; name: string }[] }>("/api/agents?options=1").then((d) => setAgentList(d.rows)).catch(() => setAgentList([]));
  }, []);
  const agentOpts = [...(agentList ?? [])];
  if (record?.agentId && record.agentName && !agentOpts.some((a) => a.id === record.agentId))
    agentOpts.unshift({ id: record.agentId, name: `${record.agentName} (blocked — kept on this record)` });

  useEffect(() => {
    if (cfg && mode === "create" && !f.currentStage && cfg.stages[0]) setF((s) => ({ ...s, currentStage: cfg.stages[0].key }));
  }, [cfg, mode, f.currentStage]);

  const set = (k: string, v: string) => {
    setF((s) => ({ ...s, [k]: v }));
    setServerErrors([]);
  };
  const issue = (d: DocType) => (auto[d] ? f.recordDate : f[ISSUE_KEY[d]]);

  const docErrors = useMemo(() => {
    const out: Partial<Record<DocType, FieldError | null>> = {};
    for (const d of DOC_TYPES) out[d] = validateDocNumber(d, f[NO_KEY[d]], cfg?.caseSensitive ?? true);
    return out;
  }, [f, cfg?.caseSensitive]);

  const preview = (d: DocType) => {
    const no = f[NO_KEY[d]].trim();
    if (!no || docErrors[d]) return null;
    const is = issue(d);
    if (!is) return null;
    if (record && record.docs[d].number === no && record.docs[d].issueDate === is && record.docs[d].expiryDate)
      return { validity: record.docs[d].validityDays, expiry: record.docs[d].expiryDate, kept: true };
    const rule = cfg?.rules[d];
    if (!rule?.active) return null;
    return { validity: rule.validityDays, expiry: calcExpiry(is, rule.validityDays), kept: false };
  };

  const significantChange = record
    ? (["invoiceNo", "containerNo", "im7No", "im4No", "exitNo", "recordDate"] as const).some((k) => ((record[k] as string | null) ?? "") !== f[k].trim()) ||
      (!!record.agentId && String(record.agentId) !== f.agentId) ||
      DOC_TYPES.some((d) => (record[ISSUE_KEY[d]] ?? "") !== (f[NO_KEY[d]].trim() ? issue(d) : ""))
    : false;

  const errFor = (field: string, label: string, required = false) => {
    const se = serverErrors.find((e) => e.field === field);
    if (se) return se.message;
    if (required && touched[field] && !f[field].trim()) return `${label} is required.`;
    return null;
  };

  const isAdmin = cfg?.user.role === "admin" && mode === "create";
  const extraNum = Number(f.extraCharges) || 0;
  const needChargeReason = isAdmin && extraNum > 0 && !f.chargesReason.trim();

  async function submit(confirmDuplicate = false, keepOpen = false) {
    if (!f.agentId) {
      setTouched((t) => ({ ...t, agentId: true, invoiceNo: true, containerNo: true }));
      toast("Select the Clearing & Forwarding agent — it is required.", "error");
      return;
    }
    if (needChargeReason) {
      toast("Please write the reason for the extra charges.", "error");
      return;
    }
    setBusy(true);
    setAgain(keepOpen);
    setTouched({ invoiceNo: true, containerNo: true, agentId: true });
    try {
      const payload: Record<string, unknown> = { ...f, confirmDuplicate };
      if (!isAdmin) for (const k of ["transporter", "transportCost", "extraCharges", "chargesReason"]) delete payload[k];
      for (const d of DOC_TYPES) payload[ISSUE_KEY[d]] = f[NO_KEY[d]].trim() ? issue(d) : "";
      if (mode === "create") {
        const r = await apiFetch<{ record: { id: number } }>("/api/records", { method: "POST", json: payload });
        toast("Record saved successfully.");
        if (keepOpen) {
          setF((s) => ({ ...s, invoiceNo: "", containerNo: "", companyName: "", im7No: "", va: "", im4No: "", exitNo: "", remarks: "", transporter: "", transportCost: "", extraCharges: "", chargesReason: "" }));
          setTouched({});
        } else if (onSaved) onSaved(r.record.id);
        else router.push(`/records/${r.record.id}`);
      } else {
        const r = await apiFetch<{ changes: number }>(`/api/records/${record!.id}`, { method: "PATCH", json: payload });
        toast(r.changes ? "Record updated. The change was written to the audit trail." : "No changes to save.", r.changes ? "success" : "info");
        onSaved?.(record!.id);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 422 && e.data?.errors) {
          setServerErrors(e.data.errors);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (e.status === 409 && e.data?.duplicates) setDups(e.data.duplicates);
        else if (e.data?.reasonRequired) {
          setReasonNeeded(true);
          toast(e.message, "error");
        } else toast(e.message, "error");
      } else toast("Something went wrong.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return <Loading />;
  const liveErrors: FieldError[] = DOC_TYPES.map((d) => docErrors[d]).filter((e): e is FieldError => !!e);
  const shown = serverErrors.length ? serverErrors : [];

  const docInput = (d: DocType) => {
    const k = NO_KEY[d];
    const e = docErrors[d];
    const info = DOC_INFO[d];
    return (
      <Field
        key={d}
        label={`${info.label} No.`}
        hint={<span>Required format: <code className="rounded bg-slate-100 px-1">{info.format}</code> — must start with “{info.prefix}”</span>}
        error={e ? e.message : errFor(k, info.label)}
      >
        <input className={`${inputCls} font-mono ${e || errFor(k, info.label) ? inputErrCls : ""}`} value={f[k]} onChange={(ev) => set(k, ev.target.value)} placeholder={`${info.prefix}…`} autoCapitalize="characters" spellCheck={false} maxLength={40} />
      </Field>
    );
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-5">
      {shown.length > 0 && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-red-800">
          <div className="flex items-center gap-1.5 font-bold">
            <IconAlertTriangle size={16} /> Please fix the following:
          </div>
          {shown.map((e, i) => (
            <div key={i} className="mt-1 text-sm">{e.message}</div>
          ))}
          <div className="mt-2 text-sm font-medium">The record cannot be saved until {shown.length > 1 ? "these errors are" : "this error is"} corrected. The failed attempt has been logged.</div>
        </div>
      )}
      {liveErrors.length > 0 && shown.length === 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          Fix the highlighted document number{liveErrors.length > 1 ? "s" : ""} before saving.
        </div>
      )}

      <Card title={mode === "create" ? "Record information" : `Edit record #${record!.id}`}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Invoice No." required error={errFor("invoiceNo", "Invoice No.", true)}>
            <input className={`${inputCls} ${errFor("invoiceNo", "Invoice No.", true) ? inputErrCls : ""}`} value={f.invoiceNo} onChange={(e) => set("invoiceNo", e.target.value)} onBlur={() => setTouched((t) => ({ ...t, invoiceNo: true }))} autoFocus={mode === "create"} />
          </Field>
          <Field label="Container No." required error={errFor("containerNo", "Container No.", true)}>
            <input className={`${inputCls} font-mono uppercase ${errFor("containerNo", "Container No.", true) ? inputErrCls : ""}`} value={f.containerNo} onChange={(e) => set("containerNo", e.target.value)} onBlur={() => setTouched((t) => ({ ...t, containerNo: true }))} />
          </Field>
          <Field label="Company Name">
            <input className={inputCls} list="company-list" value={f.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="Client / importer company" maxLength={200} />
            <datalist id="company-list">{companies.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field
            label="Clearing & Forwarding Agent"
            required
            error={errFor("agentId", "Clearing & Forwarding agent", true)}
            hint={agentList && agentList.length === 0 ? <span className="font-medium text-red-600">No active agents yet — ask the administrator to add agents (C&amp;F Agents page).</span> : "Choose from the administrator’s approved agent list."}
          >
            <select
              className={`${inputCls} ${errFor("agentId", "Clearing & Forwarding agent", true) ? inputErrCls : ""}`}
              value={f.agentId}
              onChange={(e) => set("agentId", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, agentId: true }))}
            >
              <option value="">{agentList === null ? "Loading agents…" : "— Select agent —"}</option>
              {agentOpts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          {docInput("IM7")}
          <Field label="VA">
            <input className={inputCls} value={f.va} onChange={(e) => set("va", e.target.value)} />
          </Field>
          {docInput("IM4")}
          {docInput("EXIT")}
          <Field label="Record Date" required error={errFor("recordDate", "Record Date")}>
            <input type="date" className={inputCls} value={f.recordDate} onChange={(e) => set("recordDate", e.target.value)} />
          </Field>
          <Field label="Remarks">
            <input className={inputCls} value={f.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Automatic information (calculated by the server using the current Expiry Rules)">
        <div className="grid gap-4 lg:grid-cols-3">
          {DOC_TYPES.map((d) => {
            const p = preview(d);
            const has = f[NO_KEY[d]].trim();
            return (
              <div key={d} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-sm font-bold text-slate-800">{DOC_INFO[d].label}</div>
                <label className="block text-xs font-medium text-slate-500">Issue date</label>
                <input
                  type="date"
                  className={`${inputCls} mb-2`}
                  disabled={!has}
                  value={has ? issue(d) : ""}
                  onChange={(e) => {
                    setAuto((a) => ({ ...a, [d]: false }));
                    set(ISSUE_KEY[d], e.target.value);
                  }}
                />
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs font-medium text-slate-500">Validity</div>
                    <div className="font-semibold">{p?.validity ? `${p.validity} days` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Expiry (locked)</div>
                    <div className="font-semibold text-blue-700">{p ? fmtDate(p.expiry) : "—"}</div>
                  </div>
                </div>
                {p?.kept && mode === "edit" && <div className="mt-1 text-[11px] text-slate-500">Stored value kept (historical).</div>}
                {p && !p.kept && mode === "edit" && <div className="mt-1 text-[11px] text-amber-700">Will be recalculated with the current rule.</div>}
                {!has && <div className="mt-1 text-[11px] text-slate-400">Enter the {DOC_INFO[d].label} number to calculate.</div>}
              </div>
            );
          })}
        </div>
      </Card>

      {mode === "create" && (
        <Card title="Workflow">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Current Stage">
              <select className={inputCls} value={f.currentStage} onChange={(e) => set("currentStage", e.target.value)}>
                {cfg.stages.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Next Step">
              <select className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)}>
                {NEXT_STEP_STATUSES.map((s) => (
                  <option key={s} value={s}>{NEXT_STEP_LABEL[s]}</option>
                ))}
              </select>
            </Field>
          </div>
        </Card>
      )}

      {isAdmin && (
        <Card title="Transport & charges (administrator only)">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Transporter"><input className={inputCls} value={f.transporter} onChange={(e) => set("transporter", e.target.value)} /></Field>
            <Field label="Transport cost"><input type="number" min={0} step="0.01" inputMode="decimal" className={inputCls} value={f.transportCost} onChange={(e) => set("transportCost", e.target.value)} /></Field>
            <Field label="Extra charges"><input type="number" min={0} step="0.01" inputMode="decimal" className={inputCls} value={f.extraCharges} onChange={(e) => set("extraCharges", e.target.value)} /></Field>
            <div className="md:col-span-3">
              <Field label="Reason for the charges" required={extraNum > 0} error={needChargeReason ? "A reason is required when there are extra charges." : undefined}>
                <textarea className={`${inputCls} ${needChargeReason ? inputErrCls : ""}`} rows={2} value={f.chargesReason} onChange={(e) => set("chargesReason", e.target.value)} placeholder="e.g. waiting time, demurrage, fuel surcharge…" />
              </Field>
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-600">Total: <b>{fmtMoney((Number(f.transportCost) || 0) + extraNum)}</b></div>
        </Card>
      )}

      {mode === "edit" && (
        <Card title="Reason for change">
          <Field
            label="Reason"
            required={significantChange || reasonNeeded}
            hint="Required when changing document numbers, dates, invoice or container. Recorded in the audit trail together with the old and new values."
          >
            <textarea className={`${inputCls} ${reasonNeeded && !f.reason.trim() ? inputErrCls : ""}`} rows={2} value={f.reason} onChange={(e) => set("reason", e.target.value)} placeholder="e.g. Incorrect document number entered" />
          </Field>
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>}
        {mode === "create" && (
          <Btn variant="secondary" disabled={busy} onClick={() => void submit(false, true)}>
            Save &amp; add another
          </Btn>
        )}
        <Btn type="submit" disabled={busy} className="min-w-40">
          {busy && !again ? "Saving…" : mode === "create" ? "SAVE RECORD" : "SAVE CHANGES"}
        </Btn>
      </div>

      {dups && (
        <Modal title="Possible duplicate record detected." onClose={() => setDups(null)}>
          <p className="mb-3 text-sm text-slate-600">An existing active record matches. Review it before continuing:</p>
          <div className="space-y-2">
            {dups.map((d) => (
              <div key={d.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <a className="font-semibold text-blue-700 underline" href={`/records/${d.id}`} target="_blank">Record #{d.id}</a> — {d.invoiceNo} / {d.containerNo}
                <div className="text-xs text-slate-600">IM7: {d.im7No ?? "—"} · IM4: {d.im4No ?? "—"} · {fmtDate(d.recordDate)} · matched on: <b>{d.matchedOn.join(", ")}</b></div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setDups(null)}>Cancel — go back</Btn>
            <Btn onClick={() => { setDups(null); void submit(true, again); }}>Continue anyway</Btn>
          </div>
        </Modal>
      )}
    </form>
  );
}
