"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import TransportEditor from "@/components/TransportEditor";
import { PaymentModal, PaymentsTable, type PaymentPreset } from "@/components/Payments";
import { fmtMoney } from "@/components/format";
import { fmtDate } from "@/lib/time";
import { PAY_LABEL, PAY_TONE, PAYMENT_METHODS, type PaymentRow, type PayStatus } from "@/lib/payments-shared";
import { apiFetch, ApiError, Badge, Btn, Card, Empty, ErrorBox, ExportMenu, Field, inputCls, Loading, PageHeader, qs, Stat, TableWrap, Tabs, tdCls, thCls, useApi, useDebounced, useUI } from "@/components/ui";

interface ChargeRow {
  id: number; recordDate: string; invoiceNo: string; containerNo: string; companyName: string | null; stageLabel: string; archived: boolean;
  transporter: string | null; transportCost: number | null; extraCharges: number | null; total: number; chargesReason: string | null;
  paid: number; balance: number; payStatus: PayStatus;
}
interface ChargesData { rows: ChargeRow[]; totals: { count: number; cost: number; extra: number; total: number; paid: number; balance: number }; transporters: string[]; currency: string }
interface PaymentsData { rows: PaymentRow[]; totals: { count: number; amount: number }; transporters: string[]; currency: string }
interface BalanceRow { transporter: string; records: number; charged: number; paid: number; balance: number; status: PayStatus; payments: number; lastPayment: string | null; unpaidRecords: number }
interface BalancesData { rows: BalanceRow[]; totals: { transporters: number; charged: number; paid: number; balance: number }; currency: string }

const PayBadge = ({ s }: { s: PayStatus }) => <Badge tone={PAY_TONE[s]}>{PAY_LABEL[s]}</Badge>;

// ------------------------------------------------------------------ Charges tab
function ChargesTab({ onPay, refreshKey }: { onPay: (p: PaymentPreset, currency: string, transporters: string[]) => void; refreshKey: number }) {
  const [f, setF] = useState({ q: "", transporter: "", from: "", to: "", charges: "", pay: "", archived: "0" });
  const p = { ...f, q: useDebounced(f.q), exact: f.transporter ? "1" : "", _r: refreshKey };
  const { data, loading, error, reload } = useApi<ChargesData>(`/api/transport?${qs(p)}`);
  const [edit, setEdit] = useState<ChargeRow | null>(null);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const cur = data?.currency ?? "";
  return (
    <>
      <Card className="mb-4" actions={<ExportMenu type="transport" params={{ ...p, _r: undefined }} />} title="Transport charges per container">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <div className="lg:col-span-2"><Field label="Search"><input className={inputCls} value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Invoice, container, transporter…" /></Field></div>
          <Field label="Transporter">
            <select className={inputCls} value={f.transporter} onChange={(e) => set("transporter", e.target.value)}>
              <option value="">All</option>
              {data?.transporters.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Payment status">
            <select className={inputCls} value={f.pay} onChange={(e) => set("pay", e.target.value)}>
              <option value="">Any</option><option value="outstanding">Has balance (unpaid + partial)</option>
              <option value="unpaid">Unpaid</option><option value="partial">Partially paid</option><option value="paid">Paid</option><option value="overpaid">Overpaid</option>
            </select>
          </Field>
          <Field label="From date"><input type="date" className={inputCls} value={f.from} onChange={(e) => set("from", e.target.value)} /></Field>
          <Field label="To date"><input type="date" className={inputCls} value={f.to} onChange={(e) => set("to", e.target.value)} /></Field>
          <Field label="Show">
            <select className={inputCls} value={f.charges} onChange={(e) => set("charges", e.target.value)}>
              <option value="">All</option><option value="1">With extra charges only</option>
            </select>
          </Field>
        </div>
      </Card>
      {data && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label={`Transport cost (${cur})`} value={fmtMoney(data.totals.cost)} tone="blue" />
          <Stat label={`Extra charges (${cur})`} value={fmtMoney(data.totals.extra)} tone="orange" />
          <Stat label={`Total charged (${cur})`} value={fmtMoney(data.totals.total)} />
          <Stat label={`Paid (${cur})`} value={fmtMoney(data.totals.paid)} tone="green" />
          <Stat label={`Balance owed (${cur})`} value={fmtMoney(data.totals.balance)} tone={data.totals.balance > 0 ? "red" : "green"} />
        </div>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card className="!p-0">
        {loading && !data ? <Loading /> : !data?.rows.length ? (
          <Empty>No transport charges yet. Open a record and use “Transport &amp; charges”, or add them when creating a record.</Empty>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[1250px]">
              <thead><tr>{["Date", "Invoice", "Container", "Company", "Transporter", `Cost`, `Extra`, `Total`, `Paid`, `Balance`, "Status", "Reason for charges", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-slate-50">
                    <td className={`${tdCls} whitespace-nowrap`}>{fmtDate(r.recordDate)}</td>
                    <td className={tdCls}><Link className="font-semibold text-blue-700 hover:underline" href={`/records/${r.id}`}>{r.invoiceNo}</Link>{r.archived && <span className="ml-1"><Badge tone="slate">Archived</Badge></span>}</td>
                    <td className={`${tdCls} font-mono`}>{r.containerNo}</td>
                    <td className={tdCls}>{r.companyName ?? "—"}</td>
                    <td className={`${tdCls} font-medium`}>{r.transporter ?? "—"}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(r.transportCost)}</td>
                    <td className={`${tdCls} text-right tabular-nums ${r.extraCharges ? "font-semibold text-orange-600" : ""}`}>{fmtMoney(r.extraCharges)}</td>
                    <td className={`${tdCls} text-right font-bold tabular-nums`}>{fmtMoney(r.total)}</td>
                    <td className={`${tdCls} text-right tabular-nums text-emerald-700`}>{fmtMoney(r.paid)}</td>
                    <td className={`${tdCls} text-right font-bold tabular-nums ${r.balance > 0 ? "text-red-600" : ""}`}>{fmtMoney(r.balance)}</td>
                    <td className={tdCls}><PayBadge s={r.payStatus} /></td>
                    <td className={`${tdCls} min-w-[200px] max-w-xs text-xs`}>{r.chargesReason ?? "—"}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>
                      {r.transporter && r.balance > 0 && <Btn small variant="success" onClick={() => onPay({ transporter: r.transporter!, recordId: r.id }, cur, data.transporters)}>Pay</Btn>}{" "}
                      <Btn small variant="secondary" onClick={() => setEdit(r)}>Edit</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold">
                  <td className={tdCls} colSpan={5}>TOTAL ({data.totals.count} records) — {cur}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(data.totals.cost)}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(data.totals.extra)}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(data.totals.total)}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(data.totals.paid)}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(data.totals.balance)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        )}
      </Card>
      {edit && (
        <TransportEditor recordId={edit.id} label={`${edit.invoiceNo} / ${edit.containerNo}`} initial={edit} currency={cur} transporters={data?.transporters}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ Payments tab
function PaymentsTab({ onPay, refreshKey, initialTransporter }: { onPay: (p: PaymentPreset, currency: string, transporters: string[]) => void; refreshKey: number; initialTransporter: string }) {
  const [f, setF] = useState({ q: "", transporter: initialTransporter, method: "", link: "", from: "", to: "" });
  useEffect(() => setF((s) => ({ ...s, transporter: initialTransporter })), [initialTransporter]);
  const p = { ...f, q: useDebounced(f.q), _r: refreshKey };
  const { data, loading, error, reload } = useApi<PaymentsData>(`/api/transport/payments?${qs(p)}`);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const cur = data?.currency ?? "";
  return (
    <>
      <Card
        className="mb-4"
        title="Payments made to transporters"
        actions={
          <>
            <ExportMenu type="payments" params={{ ...p, _r: undefined }} />
            <Btn variant="success" onClick={() => onPay({ transporter: f.transporter || undefined }, cur, data?.transporters ?? [])}>＋ Record payment</Btn>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Search"><input className={inputCls} value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Transporter, reference, container…" /></Field>
          <Field label="Transporter">
            <select className={inputCls} value={f.transporter} onChange={(e) => set("transporter", e.target.value)}>
              <option value="">All</option>
              {data?.transporters.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Method">
            <select className={inputCls} value={f.method} onChange={(e) => set("method", e.target.value)}>
              <option value="">Any</option>
              {Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Linked to">
            <select className={inputCls} value={f.link} onChange={(e) => set("link", e.target.value)}>
              <option value="">All</option><option value="record">A container</option><option value="general">General / lump-sum</option>
            </select>
          </Field>
          <Field label="Paid from"><input type="date" className={inputCls} value={f.from} onChange={(e) => set("from", e.target.value)} /></Field>
          <Field label="Paid to"><input type="date" className={inputCls} value={f.to} onChange={(e) => set("to", e.target.value)} /></Field>
        </div>
      </Card>
      {data && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Payments" value={data.totals.count} />
          <Stat label={`Total paid (${cur})`} value={fmtMoney(data.totals.amount)} tone="green" />
        </div>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card className="!p-0">
        {loading && !data ? <Loading /> : data && <PaymentsTable rows={data.rows} currency={cur} transporters={data.transporters} onChanged={reload} />}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ Balances tab
function BalancesTab({ onPay, onView, refreshKey }: { onPay: (p: PaymentPreset, currency: string, transporters: string[]) => void; onView: (t: string) => void; refreshKey: number }) {
  const { data, loading, error } = useApi<BalancesData>(`/api/transport/balances?_r=${refreshKey}`);
  const cur = data?.currency ?? "";
  const names = data?.rows.map((r) => r.transporter) ?? [];
  return (
    <>
      {data && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Transporters" value={data.totals.transporters} />
          <Stat label={`Total charged (${cur})`} value={fmtMoney(data.totals.charged)} />
          <Stat label={`Total paid (${cur})`} value={fmtMoney(data.totals.paid)} tone="green" />
          <Stat label={`Balance owed (${cur})`} value={fmtMoney(data.totals.balance)} tone={data.totals.balance > 0 ? "red" : "green"} />
        </div>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card className="!p-0" title="Balance per transporter (all containers, including archived)" actions={<ExportMenu type="balances" />}>
        {loading && !data ? <Loading /> : !data?.rows.length ? <Empty>No transporters yet.</Empty> : (
          <TableWrap>
            <table className="w-full min-w-[1000px]">
              <thead><tr>{["Transporter", "Containers", `Charged (${cur})`, `Paid (${cur})`, `Balance owed (${cur})`, "Status", "With balance", "Payments", "Last payment", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((r) => (
                  <tr key={r.transporter} className="hover:bg-slate-50">
                    <td className={`${tdCls} font-semibold`}>{r.transporter}</td>
                    <td className={tdCls}>{r.records}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(r.charged)}</td>
                    <td className={`${tdCls} text-right tabular-nums text-emerald-700`}>{fmtMoney(r.paid)}</td>
                    <td className={`${tdCls} text-right text-base font-bold tabular-nums ${r.balance > 0 ? "text-red-600" : r.balance < 0 ? "text-purple-700" : ""}`}>{fmtMoney(r.balance)}</td>
                    <td className={tdCls}><PayBadge s={r.status} /></td>
                    <td className={tdCls}>{r.unpaidRecords}</td>
                    <td className={tdCls}>{r.payments}</td>
                    <td className={tdCls}>{r.lastPayment ? fmtDate(r.lastPayment) : "—"}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>
                      {r.balance > 0 && <Btn small variant="success" onClick={() => onPay({ transporter: r.transporter }, cur, names)}>Pay</Btn>}{" "}
                      <Btn small variant="secondary" onClick={() => onView(r.transporter)}>Payments</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold">
                  <td className={tdCls} colSpan={2}>TOTAL</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(data.totals.charged)}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(data.totals.paid)}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{fmtMoney(data.totals.balance)}</td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        )}
      </Card>
      <p className="mt-2 text-xs text-slate-500">Balance = transport cost + extra charges − payments. General (lump-sum) payments reduce the transporter’s balance but are not tied to a specific container.</p>
    </>
  );
}

// ------------------------------------------------------------------ Page
export default function TransportPage() {
  const { toast } = useUI();
  const [tab, setTab] = useState("charges");
  const [refresh, setRefresh] = useState(0);
  const [pay, setPay] = useState<{ preset: PaymentPreset; currency: string; transporters: string[] } | null>(null);
  const [viewT, setViewT] = useState("");
  const cfg = useApi<{ currency: string }>("/api/settings/currency");
  const [cur, setCur] = useState("");
  useEffect(() => { if (cfg.data) setCur(cfg.data.currency); }, [cfg.data]);

  const openPay = (preset: PaymentPreset, currency: string, transporters: string[]) => setPay({ preset, currency: currency || cfg.data?.currency || "", transporters });
  async function saveCurrency() {
    try {
      await apiFetch("/api/settings/currency", { method: "PUT", json: { currency: cur } });
      toast("Currency saved.");
      cfg.reload();
      setRefresh((n) => n + 1);
    } catch (e) { toast(e instanceof ApiError ? e.message : "Failed", "error"); }
  }

  return (
    <>
      <PageHeader
        title="Transport & Payments"
        subtitle="Administrator only — transporter charges, payments to transporters and balances owed"
        actions={
          <div className="flex items-end gap-2">
            <label className="text-xs font-medium text-slate-500">
              Currency
              <input className={`${inputCls} mt-0.5 w-24 !py-1.5 uppercase`} value={cur} maxLength={6} onChange={(e) => setCur(e.target.value)} />
            </label>
            <Btn small variant="secondary" onClick={saveCurrency} disabled={!cur || cur.toUpperCase() === cfg.data?.currency}>Save</Btn>
          </div>
        }
      />
      <Tabs value={tab} onChange={setTab} tabs={[["charges", "🚚 Charges"], ["payments", "💳 Payments"], ["balances", "⚖ Transporter balances"]]} />
      {tab === "charges" && <ChargesTab onPay={openPay} refreshKey={refresh} />}
      {tab === "payments" && <PaymentsTab onPay={openPay} refreshKey={refresh} initialTransporter={viewT} />}
      {tab === "balances" && <BalancesTab onPay={openPay} refreshKey={refresh} onView={(t) => { setViewT(t); setTab("payments"); }} />}
      {pay && (
        <PaymentModal
          currency={pay.currency}
          transporters={pay.transporters}
          preset={pay.preset}
          onClose={() => setPay(null)}
          onSaved={() => { setPay(null); setRefresh((n) => n + 1); }}
        />
      )}
    </>
  );
}
