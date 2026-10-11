"use client";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RecordView } from "@/lib/records";
import { addDays, fmtDate, todayISO } from "@/lib/time";
import { Badge, Card, Empty, ErrorBox, ExpiryBadge, ExportMenu, Field, inputCls, Loading, PageHeader, ProcBadge, Stat, TableWrap, Tabs, tdCls, thCls, useApi } from "@/components/ui";

interface Period {
  from: string; to: string;
  summary: { total: number; completed: number; inProgress: number; pending: number; expiringSoon: number; critical: number; expired: number; validationErrors: number; stageMovements: number };
  rows: RecordView[];
}
interface Monthly extends Period {
  documents: { im7: number; im4: number; exit: number; expired: number; expiring: number };
  stageMoves: { label: string; count: number }[];
  recordsByDay: { date: string; count: number }[];
}
interface Analytics {
  byDay: { date: string; count: number }[];
  byMonth: { month: string; count: number }[];
  processing: { name: string; value: number }[];
  expiry: { name: string; value: number }[];
  errors: { name: string; value: number }[];
}

const COLORS: Record<string, string> = { Pending: "#f59e0b", "In Progress": "#3b82f6", Completed: "#10b981", Active: "#10b981", "Expiring Soon": "#f59e0b", Critical: "#f97316", Expired: "#dc2626", IM7: "#3b82f6", IM4: "#8b5cf6", Exit: "#06b6d4", Other: "#94a3b8" };

function Summary({ s }: { s: Period["summary"] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <Stat label="Total" value={s.total} />
      <Stat label="Completed" value={s.completed} tone="green" />
      <Stat label="Pending" value={s.pending + s.inProgress} tone="amber" />
      <Stat label="Expiring soon" value={s.expiringSoon} tone="amber" />
      <Stat label="Critical" value={s.critical} tone="orange" />
      <Stat label="Expired" value={s.expired} tone="red" />
      <Stat label="Errors" value={s.validationErrors} tone="red" />
      <Stat label="Stage moves" value={s.stageMovements} tone="blue" />
    </div>
  );
}

function RecordsTable({ rows }: { rows: RecordView[] }) {
  if (!rows.length) return <Empty>No records in this period.</Empty>;
  return (
    <TableWrap>
      <table className="w-full min-w-[1100px]">
        <thead><tr>{["Invoice", "Container", "Company Name", "C&F Agent", "IM7", "VA", "IM4", "IM7 Expiry", "IM4 Expiry", "Exit", "Stage", "Status", "Expiry", "Created by", "Date"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className={tdCls}><Link href={`/records/${r.id}`} className="font-semibold text-blue-700 hover:underline">{r.invoiceNo}</Link></td>
              <td className={`${tdCls} font-mono`}>{r.containerNo}</td>
              <td className={tdCls}>{r.companyName ?? "—"}</td>
              <td className={tdCls}>{r.agentName ?? "—"}</td>
              <td className={`${tdCls} font-mono`}>{r.im7No ?? "—"}</td>
              <td className={tdCls}>{r.va ?? "—"}</td>
              <td className={`${tdCls} font-mono`}>{r.im4No ?? "—"}</td>
              <td className={tdCls}>{fmtDate(r.im7ExpiryDate)}</td>
              <td className={tdCls}>{fmtDate(r.im4ExpiryDate)}</td>
              <td className={`${tdCls} font-mono`}>{r.exitNo ?? "—"}</td>
              <td className={tdCls}><Badge tone="blue">{r.stageLabel}</Badge></td>
              <td className={tdCls}><ProcBadge p={r.processing} /></td>
              <td className={tdCls}><ExpiryBadge status={r.worstStatus} /></td>
              <td className={tdCls}><div className="whitespace-nowrap">{r.createdByName ?? "—"}</div>{r.createdByPosition && <div className="whitespace-nowrap text-[11px] text-slate-500">{r.createdByPosition}</div>}</td>
              <td className={tdCls}>{fmtDate(r.recordDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function PeriodTab({ weekly }: { weekly: boolean }) {
  const today = todayISO();
  const [d, setD] = useState(weekly ? addDays(today, -6) : today);
  const from = d;
  const to = weekly ? addDays(d, 6) : d;
  const { data, loading, error } = useApi<Period>(`/api/reports/period?from=${from}&to=${to}`);
  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field label={weekly ? "Week starting" : "Report date"}>
            <input type="date" className={inputCls} value={d} onChange={(e) => e.target.value && setD(e.target.value)} />
          </Field>
          {weekly && <div className="text-sm text-slate-500">{fmtDate(from)} – {fmtDate(to)}</div>}
          <ExportMenu type="records" params={{ from, to }} />
        </div>
      </Card>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading && !data ? <Loading /> : data && (
        <>
          <Summary s={data.summary} />
          <Card className="!p-0"><RecordsTable rows={data.rows} /></Card>
        </>
      )}
    </>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function MonthlyTab() {
  const t = todayISO();
  const [m, setM] = useState(Number(t.slice(5, 7)));
  const [y, setY] = useState(Number(t.slice(0, 4)));
  const { data, loading, error } = useApi<Monthly>(`/api/reports/monthly?month=${m}&year=${y}`);
  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex gap-3">
            <Field label="Month"><select className={inputCls} value={m} onChange={(e) => setM(Number(e.target.value))}>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></Field>
            <Field label="Year"><select className={inputCls} value={y} onChange={(e) => setY(Number(e.target.value))}>{[0, 1, 2, 3, 4].map((i) => <option key={i} value={Number(t.slice(0, 4)) - i}>{Number(t.slice(0, 4)) - i}</option>)}</select></Field>
          </div>
          <ExportMenu type="records" params={{ month: m, year: y }} />
        </div>
      </Card>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading && !data ? <Loading /> : data && (
        <>
          <Summary s={data.summary} />
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="IM7 records" value={data.documents.im7} tone="blue" />
            <Stat label="IM4 records" value={data.documents.im4} tone="purple" />
            <Stat label="Exit records" value={data.documents.exit} tone="blue" />
            <Stat label="Expired documents" value={data.documents.expired} tone="red" />
            <Stat label="Expiring documents" value={data.documents.expiring} tone="amber" />
          </div>
          <div className="mb-4 grid gap-4 xl:grid-cols-2">
            <Card title="Records per day">
              <div className="h-64"><ResponsiveContainer><BarChart data={data.recordsByDay}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="count" name="Records" fill="#3b82f6" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
            </Card>
            <Card title="Stage movements (by destination stage)">
              {data.stageMoves.length ? <div className="h-64"><ResponsiveContainer><BarChart data={data.stageMoves}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="count" name="Movements" fill="#8b5cf6" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div> : <Empty>No stage movements this month.</Empty>}
            </Card>
          </div>
          <Card className="!p-0"><RecordsTable rows={data.rows} /></Card>
        </>
      )}
    </>
  );
}

function Donut({ data }: { data: { name: string; value: number }[] }) {
  if (!data.some((d) => d.value)) return <Empty>No data yet.</Empty>;
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2} label={(e) => (e.value ? String(e.value) : "")}>
            {data.map((d) => <Cell key={d.name} fill={COLORS[d.name] ?? "#94a3b8"} />)}
          </Pie>
          <Tooltip /><Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function AnalyticsTab() {
  const { data, loading, error } = useApi<Analytics>("/api/reports/analytics");
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox>{error}</ErrorBox>;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Records by day (last 30 days)"><div className="h-64"><ResponsiveContainer><BarChart data={data.byDay}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={10} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="count" name="Records" fill="#3b82f6" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
      <Card title="Records by month (last 12 months)"><div className="h-64"><ResponsiveContainer><BarChart data={data.byMonth}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" fontSize={10} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="count" name="Records" fill="#6366f1" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
      <Card title="Processing status"><Donut data={data.processing} /></Card>
      <Card title="Expiry status (monitored records)"><Donut data={data.expiry} /></Card>
      <Card title="Validation errors by document" className="xl:col-span-2">
        <div className="h-64"><ResponsiveContainer><BarChart data={data.errors}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" name="Errors" radius={[3, 3, 0, 0]}>{data.errors.map((e) => <Cell key={e.name} fill={COLORS[e.name]} />)}</Bar></BarChart></ResponsiveContainer></div>
      </Card>
    </div>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState("daily");
  return (
    <>
      <PageHeader title="Reports" subtitle="Daily, weekly and monthly reports with charts. Exports respect the selected period." />
      <Tabs value={tab} onChange={setTab} tabs={[["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["analytics", "Charts & analytics"]]} />
      {tab === "daily" && <PeriodTab weekly={false} />}
      {tab === "weekly" && <PeriodTab weekly />}
      {tab === "monthly" && <MonthlyTab />}
      {tab === "analytics" && <AnalyticsTab />}
    </>
  );
}
