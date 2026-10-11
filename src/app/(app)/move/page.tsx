"use client";
import { useState } from "react";
import MovePanel from "@/components/MovePanel";
import { Badge, Card, Empty, Field, inputCls, Loading, PageHeader, useApi, useDebounced } from "@/components/ui";
import type { RecordView } from "@/lib/records";
import { fmtDate } from "@/lib/time";

export default function MovePage() {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const dq = useDebounced(q);
  const list = useApi<{ rows: RecordView[] }>(`/api/records?q=${encodeURIComponent(dq)}&processing=&pageSize=8`);
  const detail = useApi<{ record: RecordView }>(sel ? `/api/records/${sel}` : null);

  return (
    <>
      <PageHeader title="Moved to Next Step" subtitle="Find a record, then confirm whether it has moved to the next stage" />
      <div className="grid gap-5 lg:grid-cols-5">
        <Card title="1. Find record" className="lg:col-span-2">
          <Field label="Search invoice, container, IM7, IM4…">
            <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </Field>
          <div className="mt-3 divide-y divide-slate-100">
            {list.loading && !list.data ? <Loading /> : list.data?.rows.length === 0 ? <Empty>No records found.</Empty> : null}
            {list.data?.rows.map((r) => (
              <button key={r.id} onClick={() => setSel(r.id)} className={`block w-full px-2 py-2.5 text-left text-sm transition hover:bg-blue-50 ${sel === r.id ? "bg-blue-50" : ""}`}>
                <div className="font-semibold text-slate-800">{r.invoiceNo} · <span className="font-mono">{r.containerNo}</span></div>
                <div className="text-xs text-slate-500">{fmtDate(r.recordDate)} · <Badge tone="blue">{r.stageLabel}</Badge></div>
              </button>
            ))}
          </div>
        </Card>
        <Card title="2. Confirm movement" className="lg:col-span-3">
          {!sel ? <Empty>Select a record on the left.</Empty> : detail.loading && !detail.data ? <Loading /> : detail.data ? (
            <MovePanel key={detail.data.record.currentStage + detail.data.record.id} record={detail.data.record} onMoved={() => { detail.reload(); list.reload(); }} />
          ) : null}
        </Card>
      </div>
    </>
  );
}
