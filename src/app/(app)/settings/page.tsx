"use client";
import { useEffect, useState } from "react";
import { csvList } from "@/components/format";
import { ApiError, apiFetch, Badge, Btn, Card, ErrorBox, Field, inputCls, invalidateConfig, Loading, PageHeader, TableWrap, Tabs, tdCls, thCls, Toggle, useApi, useUI } from "@/components/ui";
import { ADMIN_ONLY, PERMISSIONS, type Permission } from "@/lib/perms";
import { IconAlertTriangle, IconArrowDown, IconArrowUp, IconPlus } from "@/components/icons";
import type { EmailSettings } from "@/lib/settings";
import type { ExpiryRule } from "@/lib/validation";

const fail = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

// ------------------------------------------------------------ Expiry rules
function ExpiryPanel() {
  const { data, loading, error, reload } = useApi<{ rules: ExpiryRule[] }>("/api/settings/expiry");
  const { toast, confirm } = useUI();
  const [rules, setRules] = useState<ExpiryRule[]>([]);
  useEffect(() => { if (data) setRules(data.rules); }, [data]);
  const upd = (i: number, k: keyof ExpiryRule, v: number | boolean) => setRules((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  async function save() {
    if (!(await confirm({ title: "Save expiry rules?", message: "Changing expiry rules affects NEW calculations only. Existing records retain their original validity period and expiry date.", confirmText: "Save settings" }))) return;
    try {
      await apiFetch("/api/settings/expiry", { method: "PUT", json: { rules, confirm: true } });
      invalidateConfig();
      toast("Expiry rules saved.");
      reload();
    } catch (e) { toast(fail(e), "error"); }
  }
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  const num = (i: number, k: "validityDays" | "warning1Days" | "warning2Days" | "warning3Days") => (
    <div className="flex items-center gap-1.5">
      <input type="number" min={0} className={`${inputCls} w-24`} value={rules[i][k]} onChange={(e) => upd(i, k, Number(e.target.value))} />
      <span className="text-xs text-slate-500">days</span>
    </div>
  );
  return (
    <Card title="Expiry rule settings">
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>Changing expiry rules affects new calculations. Existing records retain their original validity period and expiry date.</span>
      </div>
      <TableWrap>
        <table className="w-full min-w-[720px]">
          <thead><tr>{["Document", "Validity", "Warning 1 (Expiring Soon)", "Warning 2", "Warning 3 (Critical)", "Active"].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rules.map((r, i) => (
              <tr key={r.documentType}>
                <td className={`${tdCls} font-bold`}>{r.documentType === "EXIT" ? "Exit" : r.documentType}</td>
                <td className={tdCls}>{num(i, "validityDays")}</td>
                <td className={tdCls}>{num(i, "warning1Days")}</td>
                <td className={tdCls}>{num(i, "warning2Days")}</td>
                <td className={tdCls}>{num(i, "warning3Days")}</td>
                <td className={tdCls}><input type="checkbox" className="h-5 w-5" checked={r.active} onChange={(e) => upd(i, "active", e.target.checked)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="mt-3 text-xs text-slate-500">Status: a document is <b>Expiring Soon</b> within Warning 1 days, <b>Critical</b> within Warning 3 days, and <b>Expired</b> after its expiry date. Warnings must be in descending order. Inactive rules skip expiry calculation for new records. A document’s countdown stops once its record moves past that document’s stage (IM7 → after “IM7 / S”, IM4 → after “IM4 / C”, Exit → after “Exit / X”).</p>
      <div className="mt-4 flex justify-end"><Btn onClick={save}>SAVE SETTINGS</Btn></div>
    </Card>
  );
}

// ------------------------------------------------------------ Email
const PRESETS: Record<string, Partial<EmailSettings>> = {
  smtp: {},
  resend: { host: "smtp.resend.com", port: 465, secure: true, username: "resend" },
  sendgrid: { host: "smtp.sendgrid.net", port: 587, secure: false, username: "apikey" },
  ses: { host: "email-smtp.us-east-1.amazonaws.com", port: 587, secure: false },
};
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function EmailPanel() {
  const { data, loading, error, reload } = useApi<{ settings: EmailSettings; secretConfigured: boolean }>("/api/settings/email");
  const { toast } = useUI();
  const [s, setS] = useState<EmailSettings | null>(null);
  const [rec, setRec] = useState("");
  const [cc, setCc] = useState("");
  const [days, setDays] = useState("");
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (data) {
      setS(data.settings);
      setRec(data.settings.recipients.join("\n"));
      setCc(data.settings.cc.join("\n"));
      setDays(data.settings.reminderDays.join(", "));
    }
  }, [data]);
  if ((loading && !data) || !s) return error ? <ErrorBox>{error}</ErrorBox> : <Loading />;
  const set = <K extends keyof EmailSettings>(k: K, v: EmailSettings[K]) => setS((x) => (x ? { ...x, [k]: v } : x));
  const body = () => ({ ...s, recipients: csvList(rec), cc: csvList(cc), reminderDays: csvList(days).map(Number) });

  async function save() {
    setBusy("save");
    try { await apiFetch("/api/settings/email", { method: "PUT", json: body() }); toast("Email settings saved."); reload(); }
    catch (e) { toast(fail(e), "error"); } finally { setBusy(""); }
  }
  async function test() {
    setBusy("test");
    try {
      await apiFetch("/api/settings/email", { method: "PUT", json: body() });
      await apiFetch("/api/settings/email/test", { method: "POST", json: { to: testTo } });
      toast("Test email sent.");
    } catch (e) { toast(fail(e), "error"); } finally { setBusy(""); }
  }
  async function run(job: string) {
    setBusy(job);
    try {
      await apiFetch("/api/jobs/run", { method: "POST", json: { job } });
      toast(job === "expiry" ? "Expiry check completed." : `${job} report sent.`);
    } catch (e) { toast(fail(e), "error"); } finally { setBusy(""); }
  }

  return (
    <div className="space-y-5">
      <Card title="Report & alert schedule">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Toggle label="Daily report" checked={s.dailyEnabled} onChange={(v) => set("dailyEnabled", v)} />
          <Toggle label="Weekly report" checked={s.weeklyEnabled} onChange={(v) => set("weeklyEnabled", v)} />
          <Toggle label="Monthly report" checked={s.monthlyEnabled} onChange={(v) => set("monthlyEnabled", v)} />
          <Toggle label="Expiry alerts" checked={s.expiryEnabled} onChange={(v) => set("expiryEnabled", v)} />
          <Toggle label="Send expired notification" checked={s.expiredEnabled} onChange={(v) => set("expiredEnabled", v)} />
          <span />
          <Field label="Daily / weekly / monthly send time (Africa/Kampala)"><input type="time" className={inputCls} value={s.dailyTime} onChange={(e) => set("dailyTime", e.target.value)} /></Field>
          <Field label="Expiry alert check time"><input type="time" className={inputCls} value={s.expiryTime} onChange={(e) => set("expiryTime", e.target.value)} /></Field>
          <Field label="Weekly report day"><select className={inputCls} value={s.weeklyDay} onChange={(e) => set("weeklyDay", Number(e.target.value))}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>
          <Field label="Reminder days before expiry" hint="Comma-separated, e.g. 14, 7, 3, 1. Each document gets one email per period."><input className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
          <Toggle label="Attach PDF to reports" checked={s.attachPdf} onChange={(v) => set("attachPdf", v)} />
          <Toggle label="Attach Excel to reports" checked={s.attachExcel} onChange={(v) => set("attachExcel", v)} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Recipients (one per line)"><textarea className={inputCls} rows={4} value={rec} onChange={(e) => setRec(e.target.value)} placeholder="admin@example.com&#10;manager@example.com" /></Field>
          <Field label="CC (optional)"><textarea className={inputCls} rows={4} value={cc} onChange={(e) => setCc(e.target.value)} /></Field>
        </div>
      </Card>

      <Card title="Email configuration (SMTP / Resend / SendGrid / Amazon SES)">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Provider">
            <select className={inputCls} value={s.provider} onChange={(e) => { const p = e.target.value as EmailSettings["provider"]; setS({ ...s, provider: p, ...PRESETS[p] }); }}>
              <option value="smtp">Custom SMTP</option><option value="resend">Resend (SMTP)</option><option value="sendgrid">SendGrid (SMTP)</option><option value="ses">Amazon SES (SMTP)</option>
            </select>
          </Field>
          <Field label="SMTP host"><input className={inputCls} value={s.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.example.com" /></Field>
          <Field label="SMTP port"><input type="number" className={inputCls} value={s.port} onChange={(e) => set("port", Number(e.target.value))} /></Field>
          <Field label="Username"><input className={inputCls} value={s.username} onChange={(e) => set("username", e.target.value)} /></Field>
          <Field label="From email"><input type="email" className={inputCls} value={s.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} /></Field>
          <Field label="From name"><input className={inputCls} value={s.fromName} onChange={(e) => set("fromName", e.target.value)} /></Field>
          <Toggle label="SSL/TLS (implicit, usually port 465)" checked={s.secure} onChange={(v) => set("secure", v)} />
          <div className="md:col-span-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <b>Password / API key:</b> {data?.secretConfigured ? <Badge tone="green">Configured</Badge> : <Badge tone="red">Not set</Badge>}
              <div className="mt-1 text-xs text-slate-500">Secrets are never stored in the database or sent to the browser. Set the <code>SMTP_PASSWORD</code> environment secret (for Resend / SendGrid, the API key).</div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Test email recipient"><input type="email" className={`${inputCls} w-72`} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com (default: your account)" /></Field>
          <Btn variant="secondary" onClick={test} disabled={!!busy}>{busy === "test" ? "Sending…" : "SEND TEST EMAIL"}</Btn>
          <div className="ml-auto"><Btn onClick={save} disabled={!!busy}>{busy === "save" ? "Saving…" : "SAVE SETTINGS"}</Btn></div>
        </div>
      </Card>

      <Card title="Run now (uses the saved settings)">
        <div className="flex flex-wrap gap-2">
          <Btn variant="secondary" onClick={() => run("expiry")} disabled={!!busy}>Run expiry check</Btn>
          <Btn variant="secondary" onClick={() => run("daily")} disabled={!!busy}>Send daily report</Btn>
          <Btn variant="secondary" onClick={() => run("weekly")} disabled={!!busy}>Send weekly report</Btn>
          <Btn variant="secondary" onClick={() => run("monthly")} disabled={!!busy}>Send monthly report</Btn>
        </div>
        <p className="mt-2 text-xs text-slate-500">Scheduled jobs run automatically every minute (catch-up safe, once per period). Failed emails appear in Email History where they can be retried.</p>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------ Workflow
interface St { key?: string; label: string; active: boolean; isFinal: boolean }
function WorkflowPanel() {
  const { data, loading, error, reload } = useApi<{ stages: St[] }>("/api/settings/stages");
  const { toast } = useUI();
  const [st, setSt] = useState<St[]>([]);
  useEffect(() => { if (data) setSt(data.stages); }, [data]);
  const move = (i: number, d: number) => setSt((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });
  async function save() {
    try { await apiFetch("/api/settings/stages", { method: "PUT", json: { stages: st } }); invalidateConfig(); toast("Workflow saved."); reload(); }
    catch (e) { toast(fail(e), "error"); }
  }
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  return (
    <Card title="Workflow stages">
      <p className="mb-3 text-sm text-slate-500">Order, rename, add or deactivate stages. Stages are never deleted, so history stays intact. At least one active stage must be marked as final (Completed).</p>
      <div className="space-y-2">
        {st.map((s, i) => (
          <div key={s.key ?? `new${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
            <span className="w-6 text-center text-sm font-bold text-slate-400">{i + 1}</span>
            <input className={`${inputCls} min-w-40 flex-1`} value={s.label} onChange={(e) => setSt((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={s.active} onChange={(e) => setSt((x) => x.map((y, j) => (j === i ? { ...y, active: e.target.checked } : y)))} /> Active</label>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={s.isFinal} onChange={(e) => setSt((x) => x.map((y, j) => (j === i ? { ...y, isFinal: e.target.checked } : y)))} /> Final</label>
            <Btn small variant="ghost" onClick={() => move(i, -1)} aria-label="Move up">
              <IconArrowUp size={14} />
            </Btn>
            <Btn small variant="ghost" onClick={() => move(i, 1)} aria-label="Move down">
              <IconArrowDown size={14} />
            </Btn>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-between">
        <Btn variant="secondary" onClick={() => setSt((s) => [...s, { label: "", active: true, isFinal: false }])}>
          <IconPlus size={15} /> Add stage
        </Btn>
        <Btn onClick={save}>Save workflow</Btn>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------ Validation
function ValidationPanel() {
  const { data, reload } = useApi<{ caseSensitive: boolean }>("/api/settings/validation");
  const { toast } = useUI();
  async function set(v: boolean) {
    try { await apiFetch("/api/settings/validation", { method: "PUT", json: { caseSensitive: v } }); invalidateConfig(); toast("Validation setting saved."); reload(); }
    catch (e) { toast(fail(e), "error"); }
  }
  if (!data) return <Loading />;
  return (
    <Card title="Document number validation">
      <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-slate-700">
        <li><b>IM7</b> numbers must start with <b>S</b></li>
        <li><b>IM4</b> numbers must start with <b>C</b></li>
        <li><b>Exit</b> numbers must start with <b>X</b></li>
      </ul>
      <p className="mb-3 text-sm text-slate-500">Enforced in the form, the API, record edits and Excel imports. Failures are written to the Error Log.</p>
      <div className="max-w-md"><Toggle label="Case-sensitive prefix (reject lowercase c / x)" checked={data.caseSensitive} onChange={set} /></div>
      <p className="mt-2 text-xs text-slate-500">When off, lowercase prefixes are accepted and stored in upper case.</p>
    </Card>
  );
}

// ------------------------------------------------------------ Permissions
function PermissionsPanel() {
  const { data, loading, error } = useApi<{ matrix: Record<string, Permission[]> }>("/api/settings/permissions");
  const { toast } = useUI();
  const [m, setM] = useState<Record<string, Permission[]>>({});
  useEffect(() => { if (data) setM(data.matrix); }, [data]);
  const toggle = (role: string, p: Permission) => setM((x) => ({ ...x, [role]: x[role]?.includes(p) ? x[role].filter((y) => y !== p) : [...(x[role] ?? []), p] }));
  async function save() {
    try { await apiFetch("/api/settings/permissions", { method: "PUT", json: { matrix: m } }); toast("Permissions saved."); }
    catch (e) { toast(fail(e), "error"); }
  }
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  return (
    <Card title="Roles & permissions">
      <TableWrap>
        <table className="w-full">
          <thead><tr><th className={thCls}>Permission</th><th className={thCls}>Administrator</th><th className={thCls}>Staff</th><th className={thCls}>Viewer</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(Object.keys(PERMISSIONS) as Permission[]).map((p) => ADMIN_ONLY.includes(p) ? (
              <tr key={p}>
                <td className={tdCls}>{PERMISSIONS[p]}</td>
                <td className={tdCls}><input type="checkbox" checked disabled className="h-4 w-4" /></td>
                <td className={`${tdCls} text-xs text-slate-400`} colSpan={2}>Always administrator-only</td>
              </tr>
            ) : (
              <tr key={p}>
                <td className={tdCls}>{PERMISSIONS[p]} <span className="text-xs text-slate-400">({p})</span></td>
                <td className={tdCls}><input type="checkbox" checked disabled className="h-4 w-4" /></td>
                {["staff", "viewer"].map((r) => <td key={r} className={tdCls}><input type="checkbox" className="h-4 w-4" checked={m[r]?.includes(p) ?? false} onChange={() => toggle(r, p)} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <div className="mt-4 flex justify-end"><Btn onClick={save}>Save permissions</Btn></div>
    </Card>
  );
}

function SystemPanel() {
  return (
    <Card title="System, security & backups">
      <div className="space-y-3 text-sm text-slate-700">
        <p><b>Timezone:</b> Africa/Kampala (UTC+3). Timestamps are stored in UTC and displayed in this timezone.</p>
        <p><b>Data safety:</b> records are archived (soft-deleted), never removed by default. Permanent deletion needs an archived record, the delete permission and a reason, and is audit-logged. Stage history and audit logs cannot be edited from the app.</p>
        <p><b>Backups:</b> run <code className="rounded bg-slate-100 px-1">pg_dump -Fc $DATABASE_URL &gt; backup_$(date +%F).dump</code> nightly (cron) and copy off-server; keep 30 daily + 12 monthly copies and test a restore quarterly. See README.md.</p>
        <p><b>Secrets:</b> <code>SMTP_PASSWORD</code>, <code>SESSION_SECRET</code>, <code>CRON_SECRET</code>, <code>ADMIN_PASSWORD</code> are read from environment variables only.</p>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState("expiry");
  return (
    <>
      <PageHeader title="Settings" subtitle="Administrator configuration — nothing here is hard-coded" />
      <Tabs value={tab} onChange={setTab} tabs={[["expiry", "Expiry Rules"], ["email", "Email"], ["workflow", "Workflow"], ["validation", "Validation"], ["perms", "Roles & Permissions"], ["system", "System"]]} />
      {tab === "expiry" && <ExpiryPanel />}
      {tab === "email" && <EmailPanel />}
      {tab === "workflow" && <WorkflowPanel />}
      {tab === "validation" && <ValidationPanel />}
      {tab === "perms" && <PermissionsPanel />}
      {tab === "system" && <SystemPanel />}
    </>
  );
}
