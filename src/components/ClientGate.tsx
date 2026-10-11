"use client";
import { useEffect, useState, type ReactNode } from "react";
import AppShell from "./AppShell";
import { apiFetch, getToken, setToken } from "./ui";

interface Me {
  user: { id: number; name: string; email: string; role: string; position?: string | null };
  permissions: string[];
}

/**
 * Used when the server did not receive the session cookie (browsers that block cookies inside an
 * embedded preview). Signs in with the stored token via the Authorization header instead.
 */
export default function ClientGate({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    if (!getToken()) {
      location.replace("/login");
      return;
    }
    apiFetch<Me>("/api/config")
      .then(setMe)
      .catch(() => {
        setToken(null);
        location.replace("/login");
      });
  }, []);
  if (!me) return <div className="grid min-h-screen place-items-center text-sm text-slate-400">Loading…</div>;
  return (
    <AppShell user={me.user} permissions={me.permissions}>
      {children}
    </AppShell>
  );
}
