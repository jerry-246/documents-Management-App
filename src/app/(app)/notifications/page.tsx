"use client";
import Link from "next/link";
import { fmtDateTime } from "@/lib/time";
import { apiFetch, Btn, Card, Empty, ErrorBox, Loading, PageHeader, useApi } from "@/components/ui";

interface N { id: number; kind: string; message: string; link: string | null; createdAt: string; read: boolean }

export default function NotificationsPage() {
  const { data, loading, error, reload } = useApi<{ rows: N[]; unread: number }>("/api/notifications");
  async function markAll() {
    await apiFetch("/api/notifications", { method: "POST", json: {} });
    reload();
  }
  async function markOne(id: number) {
    await apiFetch("/api/notifications", { method: "POST", json: { ids: [id] } });
    reload();
  }
  return (
    <>
      <PageHeader title="Notifications" subtitle="Expiry alerts, validation errors and report status" actions={<Btn variant="secondary" onClick={markAll} disabled={!data?.unread}>Mark all as read</Btn>} />
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card className="!p-0">
        {loading && !data ? <Loading /> : !data?.rows.length ? <Empty>No notifications yet.</Empty> : (
          <ul className="divide-y divide-slate-100">
            {data.rows.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.read ? "" : "bg-blue-50/60"}`}>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${n.read ? "text-slate-600" : "font-semibold text-slate-900"}`}>
                    {n.link ? <Link href={n.link} onClick={() => !n.read && markOne(n.id)} className="hover:underline">{n.message}</Link> : n.message}
                  </div>
                  <div className="text-xs text-slate-400">{fmtDateTime(n.createdAt)}</div>
                </div>
                {!n.read && <button onClick={() => markOne(n.id)} className="shrink-0 text-xs font-semibold text-blue-600">Mark read</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
