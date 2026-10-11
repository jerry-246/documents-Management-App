"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch, SessionProvider, setToken, useApi } from "./ui";

const NAV: { href: string; label: string; icon: string; perm?: string }[] = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/records/new", label: "New Record", icon: "＋", perm: "records.create" },
  { href: "/records", label: "Records", icon: "☰", perm: "records.view" },
  { href: "/move", label: "Move to Next Step", icon: "➜", perm: "records.move" },
  { href: "/expiry", label: "Expiry Monitoring", icon: "⏳", perm: "expiry.view" },
  { href: "/agents", label: "C&F Agents", icon: "🏢", perm: "agents.manage" },
  { href: "/transport", label: "Transport & Payments", icon: "🚚", perm: "transport.manage" },
  { href: "/reports", label: "Reports", icon: "📊", perm: "reports.view" },
  { href: "/import", label: "Excel Import", icon: "⇪", perm: "records.import" },
  { href: "/errors", label: "Error Log", icon: "⚠", perm: "errors.view" },
  { href: "/emails", label: "Email History", icon: "✉", perm: "emails.view" },
  { href: "/notifications", label: "Notifications", icon: "🔔" },
  { href: "/audit", label: "Audit Log", icon: "🗒", perm: "audit.view" },
  { href: "/users", label: "Users", icon: "👥", perm: "users.manage" },
  { href: "/settings", label: "Settings", icon: "⚙", perm: "settings.manage" },
];

function Bell() {
  const { data } = useApi<{ unread: number }>("/api/notifications?_=badge");
  const [n, setN] = useState(0);
  useEffect(() => {
    if (data) setN(data.unread);
    const t = setInterval(() => apiFetch<{ unread: number }>("/api/notifications").then((d) => setN(d.unread)).catch(() => {}), 60_000);
    return () => clearInterval(t);
  }, [data]);
  return (
    <Link href="/notifications" className="relative rounded-lg p-2 text-lg hover:bg-slate-100" aria-label="Notifications">
      🔔
      {n > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}

export default function AppShell({
  user,
  permissions,
  children,
}: {
  user: { id: number; name: string; email: string; role: string; position?: string | null };
  permissions: string[];
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => setOpen(false), [path]);
  const items = NAV.filter((n) => !n.perm || user.role === "admin" || permissions.includes(n.perm));
  const guard = [...NAV]
    .filter((n) => n.perm && (n.href === "/" ? false : path === n.href || path.startsWith(n.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const denied = !!guard && user.role !== "admin" && !permissions.includes(guard.perm!);
  const active = (h: string) => (h === "/" ? path === "/" : path === h || (path.startsWith(h + "/") && !items.some((o) => o.href !== h && o.href.length > h.length && path.startsWith(o.href))));

  return (
    <SessionProvider value={{ user, permissions }}>
      <div className="min-h-screen lg:flex">
        {open && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setOpen(false)} />}
        <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform overflow-y-auto bg-slate-900 text-slate-200 transition lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="px-5 py-5">
            <div className="text-lg font-bold text-white">📦 Container Tracker</div>
            <div className="text-xs text-slate-400">Documents · Expiry · Workflow</div>
          </div>
          <nav className="space-y-0.5 px-3 pb-6">
            {items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active(n.href) ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
              >
                <span className="w-5 text-center">{n.icon}</span>
                {n.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
            <button className="rounded-lg p-2 text-xl hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
              ☰
            </button>
            {permissions.includes("records.view") && (
              <form
                className="flex-1 sm:max-w-md"
                onSubmit={(e) => {
                  e.preventDefault();
                  router.push(`/records?q=${encodeURIComponent(q)}`);
                }}
              >
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search invoice, container, IM7, VA, IM4, Exit, date, stage…"
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-200"
                />
              </form>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Bell />
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-sm font-semibold text-slate-800">{user.name}</div>
                <div className="text-xs text-slate-500">{user.position || <span className="capitalize">{user.role}</span>}</div>
              </div>
              <button
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                onClick={async () => {
                  await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
                  setToken(null);
                  location.href = "/login";
                }}
              >
                Sign out
              </button>
            </div>
          </header>
          <main className="mx-auto max-w-[1400px] p-4 sm:p-6">
            {denied ? (
              <div className="mx-auto mt-16 max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
                <div className="text-3xl">🔒</div>
                <h1 className="mt-2 text-lg font-bold text-red-800">Access denied</h1>
                <p className="mt-1 text-sm text-red-700">Your role does not have permission to open this page.</p>
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
