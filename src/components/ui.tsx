"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ExpiryRule, ExpiryStatus } from "@/lib/validation";
import { EXPIRY_LABEL } from "@/lib/validation";
import { IconAlertTriangle, IconCheck, IconChevronLeft, IconChevronRight, IconX } from "./icons";

// ---------------- API ----------------
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: any,
  ) {
    super(message);
  }
}

// ---- session token fallback (used when the browser blocks the cookie, e.g. inside an embedded preview)
const TOKEN_KEY = "cts_token";
// In-memory copy: works even when the browser blocks BOTH cookies and storage inside an embedded preview frame.
let memToken: string | null = null;
export function getToken(): string | null {
  if (memToken) return memToken;
  try {
    return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string | null) {
  memToken = t;
  try {
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      sessionStorage.setItem(TOKEN_KEY, t);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}
function authHeaders(h: Headers) {
  const t = getToken();
  if (t && !h.has("Authorization")) h.set("Authorization", `Bearer ${t}`);
  return h;
}

/** Download a file from an authenticated endpoint (works with cookie OR token). */
export async function downloadFile(url: string) {
  const res = await fetch(url, { headers: authHeaders(new Headers()), credentials: "same-origin" });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d?.error ?? "Download failed");
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? "export";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export async function apiFetch<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers = authHeaders(new Headers(init?.headers));
  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(url, { ...init, headers, body, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    setToken(null);
    location.href = "/login";
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "Request failed", data);
  return data as T;
}

export function useApi<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    let cancel = false;
    setLoading(true);
    apiFetch<T>(url)
      .then((d) => !cancel && (setData(d), setError(null)))
      .catch((e) => !cancel && setError(e.message))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [url, tick]);
  return { data, error, loading, reload: useCallback(() => setTick((t) => t + 1), []) };
}

export function qs(o: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  return p.toString();
}

// ---------------- config / session ----------------
export interface Config {
  user: { id: number; name: string; email: string; role: string };
  permissions: string[];
  rules: Record<"IM7" | "IM4" | "EXIT", ExpiryRule>;
  stages: { key: string; label: string; position: number; active: boolean; isFinal: boolean }[];
  caseSensitive: boolean;
}
let cfgPromise: Promise<Config> | null = null;
export function invalidateConfig() {
  cfgPromise = null;
}
export function useConfig(): Config | null {
  const [cfg, setCfg] = useState<Config | null>(null);
  useEffect(() => {
    cfgPromise ??= apiFetch<Config>("/api/config");
    cfgPromise.then(setCfg).catch(() => (cfgPromise = null));
  }, []);
  return cfg;
}

const SessionCtx = createContext<{ user: { id: number; name: string; email: string; role: string; position?: string | null }; permissions: string[] } | null>(null);
export const SessionProvider = SessionCtx.Provider;
export function useSession() {
  const s = useContext(SessionCtx);
  return { user: s?.user, permissions: s?.permissions ?? [], can: (p: string) => !!s?.permissions.includes(p) };
}

// ---------------- toast + confirm ----------------
interface UIApi {
  toast: (msg: string, type?: "success" | "error" | "info") => void;
  confirm: (o: { title: string; message?: ReactNode; confirmText?: string; danger?: boolean }) => Promise<boolean>;
}
const UICtx = createContext<UIApi>({ toast: () => {}, confirm: async () => false });
export const useUI = () => useContext(UICtx);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);
  const [dlg, setDlg] = useState<{ o: Parameters<UIApi["confirm"]>[0]; res: (v: boolean) => void } | null>(null);
  const id = useRef(0);
  const toast = useCallback<UIApi["toast"]>((msg, type = "success") => {
    const n = ++id.current;
    setToasts((t) => [...t, { id: n, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n)), 4500);
  }, []);
  const confirm = useCallback<UIApi["confirm"]>((o) => new Promise((res) => setDlg({ o, res })), []);
  const close = (v: boolean) => {
    dlg?.res(v);
    setDlg(null);
  };
  return (
    <UICtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="fixed right-4 top-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ring-1 ${
              t.type === "error" ? "bg-red-50 text-red-800 ring-red-200" : t.type === "info" ? "bg-blue-50 text-blue-800 ring-blue-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"
            }`}
          >
            {t.type === "error" ? <IconAlertTriangle size={16} className="mt-0.5 shrink-0" /> : t.type === "success" ? <IconCheck size={16} className="mt-0.5 shrink-0" /> : null}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
      {dlg && (
        <Modal title={dlg.o.title} onClose={() => close(false)} small>
          <div className="text-sm text-slate-600">{dlg.o.message}</div>
          <div className="mt-5 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => close(false)}>
              Cancel
            </Btn>
            <Btn variant={dlg.o.danger ? "danger" : "primary"} onClick={() => close(true)}>
              {dlg.o.confirmText ?? "Confirm"}
            </Btn>
          </div>
        </Modal>
      )}
    </UICtx.Provider>
  );
}

// ---------------- primitives ----------------
export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100 disabled:text-slate-500";
export const inputErrCls = "!border-red-500 !bg-red-50 focus:!ring-red-200";
export const thCls = "whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
export const tdCls = "px-3 py-2.5 text-sm text-slate-700";

export function Card({ children, className = "", title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

const BTN: Record<string, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300",
  secondary: "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  ghost: "text-slate-600 hover:bg-slate-100 disabled:opacity-50",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300",
};
export function Btn({ variant = "primary", small, className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN; small?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed ${small ? "px-2.5 py-1.5 text-xs" : "px-4 py-2.5 text-sm"} ${BTN[variant]} ${className}`}
    />
  );
}

const TONES: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-100 text-amber-800 ring-amber-200",
  orange: "bg-orange-100 text-orange-800 ring-orange-300",
  red: "bg-red-100 text-red-800 ring-red-200",
  blue: "bg-blue-100 text-blue-800 ring-blue-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  purple: "bg-purple-100 text-purple-800 ring-purple-200",
};
export function Badge({ tone = "slate", children }: { tone?: string; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}
export const EXPIRY_TONE: Record<ExpiryStatus, string> = { active: "green", expiring_soon: "amber", critical: "orange", expired: "red" };
export function ExpiryBadge({ status }: { status?: ExpiryStatus | null }) {
  return status ? <Badge tone={EXPIRY_TONE[status]}>{EXPIRY_LABEL[status]}</Badge> : <span className="text-slate-400">—</span>;
}
export function ProcBadge({ p }: { p: string }) {
  const m: Record<string, [string, string]> = { pending: ["amber", "Pending"], in_progress: ["blue", "In Progress"], completed: ["green", "Completed"] };
  const [t, l] = m[p] ?? ["slate", p];
  return <Badge tone={t}>{l}</Badge>;
}

export function Field({ label, hint, error, children, required }: { label: string; hint?: ReactNode; error?: ReactNode; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Modal({ title, children, onClose, small }: { title: string; children: ReactNode; onClose: () => void; small?: boolean }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`mt-10 w-full rounded-xl bg-white p-5 shadow-2xl ${small ? "max-w-md" : "max-w-3xl"}`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <IconX size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map(([k, l]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${value === k ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
      <span>
        {total} result{total === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-2">
        <Btn variant="secondary" small disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <IconChevronLeft size={14} /> Prev
        </Btn>
        <span>
          Page {page} / {pages}
        </span>
        <Btn variant="secondary" small disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <IconChevronRight size={14} />
        </Btn>
      </div>
    </div>
  );
}

export function ExportMenu({ type, params }: { type: string; params?: Record<string, string | number | boolean | null | undefined> }) {
  const { can } = useSession();
  const { toast } = useUI();
  const [busy, setBusy] = useState("");
  if (!can("reports.export")) return null;
  const base = qs({ ...params, type, page: undefined, pageSize: undefined });
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-xs font-medium text-slate-500">Export:</span>
      {(["xlsx", "csv", "pdf"] as const).map((f) => (
        <button
          key={f}
          type="button"
          disabled={!!busy}
          onClick={async () => {
            setBusy(f);
            try {
              await downloadFile(`/api/export?${base}&format=${f}`);
            } catch (e) {
              toast(e instanceof Error ? e.message : "Download failed", "error");
            } finally {
              setBusy("");
            }
          }}
          className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold uppercase text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === f ? "…" : f === "xlsx" ? "Excel" : f}
        </button>
      ))}
    </div>
  );
}

export function Loading() {
  return <div className="p-8 text-center text-sm text-slate-400">Loading…</div>;
}
export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{children}</div>;
}
export function Empty({ children = "Nothing to show." }: { children?: ReactNode }) {
  return <div className="p-8 text-center text-sm text-slate-400">{children}</div>;
}
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-slate-200">{children}</div>;
}

export function Stat({ label, value, tone = "slate", href }: { label: string; value: ReactNode; tone?: string; href?: string }) {
  const color: Record<string, string> = {
    slate: "text-slate-900", blue: "text-blue-700", green: "text-emerald-600", amber: "text-amber-600", orange: "text-orange-600", red: "text-red-600", purple: "text-purple-700",
  };
  const inner = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${color[tone]}`}>{value}</div>
    </div>
  );
  return href ? <a href={href}>{inner}</a> : inner;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-blue-600" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

/** Hook: debounced value */
export function useDebounced<T>(v: T, ms = 300): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}
