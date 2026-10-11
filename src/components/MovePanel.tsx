"use client";
import { useState } from "react";
import type { RecordView } from "@/lib/records";
import { DOC_INFO, DOC_TYPES, NEXT_STEP_LABEL, NEXT_STEP_STATUSES, docStopped } from "@/lib/validation";
import { ApiError, apiFetch, Btn, Field, inputCls, Loading, useConfig, useUI } from "./ui";

export default function MovePanel({ record, onMoved }: { record: RecordView; onMoved: () => void }) {
  const cfg = useConfig();
  const { toast } = useUI();
  const [moved, setMoved] = useState<"" | "yes" | "no">("");
  const idx = cfg?.stages.findIndex((s) => s.key === record.currentStage) ?? -1;
  const suggested = cfg && idx >= 0 ? (cfg.stages[idx + 1]?.key ?? "") : "";
  const [stage, setStage] = useState("");
  const [status, setStatus] = useState("pending");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  if (!cfg) return <Loading />;
  const target = stage || suggested;

  async function save() {
    setBusy(true);
    try {
      const r = await apiFetch<{ moved: boolean }>(`/api/records/${record.id}/move`, {
        method: "POST",
        json: { moved: moved === "yes", newStage: target, status, remarks },
      });
      toast(r.moved ? "Stage movement saved to history." : "No change recorded.", r.moved ? "success" : "info");
      setMoved("");
      setStage("");
      setRemarks("");
      onMoved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const label = (k: string) => cfg.stages.find((s) => s.key === k)?.label ?? k;
  const posOf = (k: string) => cfg.stages.find((s) => s.key === k)?.position;
  const curPos = posOf(record.currentStage);
  const tgtPos = target ? posOf(target) : undefined;
  const stopping = DOC_TYPES.filter((d) => record.docs[d].expiryDate && !docStopped(d, curPos, posOf) && docStopped(d, tgtPos, posOf));
  const resuming = DOC_TYPES.filter((d) => record.docs[d].expiryDate && docStopped(d, curPos, posOf) && !docStopped(d, tgtPos, posOf));
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <b>{record.invoiceNo}</b> · {record.containerNo} · current stage: <b className="text-blue-700">{record.stageLabel}</b>
      </div>
      <div>
        <div className="mb-2 text-sm font-semibold text-slate-800">Has this record moved to the next step?</div>
        <div className="flex gap-3">
          {(["yes", "no"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setMoved(v)}
              className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-bold uppercase transition ${moved === v ? (v === "yes" ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-500 bg-slate-100 text-slate-700") : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {moved === "yes" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="New stage" required hint={`Previous stage: ${label(record.currentStage)}`}>
            <select className={inputCls} value={target} onChange={(e) => setStage(e.target.value)}>
              <option value="">— choose —</option>
              {cfg.stages.filter((s) => s.key !== record.currentStage).map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Next step status">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              {NEXT_STEP_STATUSES.map((s) => (
                <option key={s} value={s}>{NEXT_STEP_LABEL[s]}</option>
              ))}
            </select>
          </Field>
          {(stopping.length > 0 || resuming.length > 0) && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 md:col-span-2">
              {stopping.length > 0 && <div>⏹ The expiry countdown for <b>{stopping.map((d) => DOC_INFO[d].label).join(", ")}</b> will stop — it will no longer be counted or alerted.</div>}
              {resuming.length > 0 && <div>▶ The expiry countdown for <b>{resuming.map((d) => DOC_INFO[d].label).join(", ")}</b> will resume (moving back).</div>}
            </div>
          )}
          <div className="md:col-span-2">
            <Field label="Remarks" hint="Date, time and user are captured automatically.">
              <textarea className={inputCls} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>
          </div>
        </div>
      )}
      {moved === "no" && <p className="text-sm text-slate-500">The record stays in <b>{record.stageLabel}</b>. Nothing will be changed.</p>}
      {moved && (
        <div className="flex justify-end">
          <Btn variant={moved === "yes" ? "success" : "secondary"} disabled={busy || (moved === "yes" && !target)} onClick={save}>
            {moved === "yes" ? "Save movement" : "Confirm — not moved"}
          </Btn>
        </div>
      )}
    </div>
  );
}
