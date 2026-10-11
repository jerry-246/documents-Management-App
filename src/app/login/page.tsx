"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, Btn, inputCls, setToken } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [framed, setFramed] = useState(false);
  const router = useRouter();
  useEffect(() => {
    try {
      setFramed(window.self !== window.top);
    } catch {
      setFramed(true);
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      setToken(null);
      const r = await apiFetch<{ token: string }>("/api/auth/login", { method: "POST", json: { email: email.trim(), password } });
      setToken(r.token);
      // client-side navigation keeps the in-memory session (a full reload would lose it if storage is blocked)
      router.replace("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="text-4xl">📦</div>
          <h1 className="mt-2 text-xl font-bold text-slate-900">Container &amp; Document Tracking</h1>
          <p className="text-sm text-slate-500">Sign in to continue</p>
        </div>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
          <input className={inputCls} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
          <input className={inputCls} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {err && <div className="mb-3 rounded-lg bg-red-50 p-2.5 text-sm font-medium text-red-700">❌ {err}</div>}
        <Btn type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Btn>
        {framed && (
          <a href="/login" target="_blank" rel="noopener" className="mt-3 block text-center text-xs font-semibold text-blue-600 hover:underline">
            Trouble signing in here? Open the app in a new tab ↔
          </a>
        )}
      </form>
    </main>
  );
}
