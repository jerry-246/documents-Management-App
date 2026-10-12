"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, Btn, inputCls, setToken } from "@/components/ui";
import { IconAlertTriangle, IconArrowLeft, IconArrowRight, IconKey, IconPackage } from "@/components/icons";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "forgot" | "change">("signin");
  const [note, setNote] = useState("");
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    try {
      setFramed(window.self !== window.top);
    } catch {
      setFramed(true);
    }
  }, []);

  // Update the page title per mode.
  useEffect(() => {
    document.title = mode === "signin" ? "Sign in" : mode === "forgot" ? "Reset password" : "Change password";
  }, [mode]);

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
            <IconPackage size={26} />
          </div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">Container &amp; Document Tracking</h1>
          <p className="text-sm text-slate-500">{mode === "signin" ? "Sign in to continue" : mode === "forgot" ? "Reset your password" : "Change your password"}</p>
        </div>
        {note && <div className="mb-4 rounded-lg bg-blue-50 p-2.5 text-sm font-medium text-blue-800">{note}</div>}
        {mode === "signin" ? (
          <SignIn onForgot={() => { setNote(""); setMode("forgot"); }} onChangePw={() => { setNote(""); setMode("change"); }} />
        ) : mode === "forgot" ? (
          <Forgot onBack={() => { setNote(""); setMode("signin"); }} onDone={(msg) => { setNote(msg); setMode("signin"); }} />
        ) : (
          <ChangePassword onBack={() => { setNote(""); setMode("signin"); }} onDone={(msg) => { setNote(msg); setMode("signin"); }} />
        )}
        {framed && (
          <a href="/login" target="_blank" rel="noopener" className="mt-3 block text-center text-xs font-semibold text-blue-600 hover:underline">
            Trouble signing in here? Open the app in a new tab
          </a>
        )}
      </div>
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 p-2.5 text-sm font-medium text-red-700">
      <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function SignIn({ onForgot, onChangePw }: { onForgot: () => void; onChangePw: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      setToken(null);
      const r = await apiFetch<{ token: string }>("/api/auth/login", { method: "POST", json: { email: email.trim(), password } });
      setToken(r.token);
      router.replace("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed");
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <label className="mb-3 block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
        <input className={inputCls} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </label>
      <label className="mb-4 block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
        <input className={inputCls} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {err && <Notice>{err}</Notice>}
      <Btn type="submit" className="w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Btn>
      <div className="mt-4 flex items-center justify-between text-xs">
        <button type="button" className="font-semibold text-blue-600 hover:underline" onClick={onForgot}>
          Forgot password?
        </button>
        <button type="button" className="font-semibold text-slate-500 hover:underline" onClick={onChangePw}>
          Change password / set security question
        </button>
      </div>
    </form>
  );
}

function Forgot({ onBack, onDone }: { onBack: () => void; onDone: (msg: string) => void }) {
  const [email, setEmail] = useState("");
  const [question, setQuestion] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [answer, setAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await apiFetch<{ hasQuestion: boolean; question?: string }>("/api/auth/forgot", { method: "POST", json: { email: email.trim() } });
      setAsked(true);
      setQuestion(r.hasQuestion ? r.question ?? null : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }
  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await apiFetch("/api/auth/reset", { method: "POST", json: { email: email.trim(), answer, newPassword } });
      onDone("Your password has been reset. Please sign in with your new password.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={asked && question ? reset : find}>
      <label className="mb-3 block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
        <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus disabled={asked && !!question} />
      </label>
      {asked && !question && (
        <div className="mb-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-800">
          No security question is set for this account. Please ask an administrator to reset your password.
        </div>
      )}
      {asked && question && (
        <>
          <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            <span className="font-semibold">Security question:</span> {question}
          </div>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Your answer</span>
            <input className={inputCls} value={answer} onChange={(e) => setAnswer(e.target.value)} required />
          </label>
          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">New password (min 8 characters)</span>
            <input className={inputCls} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </label>
        </>
      )}
      {err && <Notice>{err}</Notice>}
      <Btn type="submit" className="w-full" disabled={busy}>
        {busy ? "Please wait…" : asked && question ? "Reset password" : "Continue"}
      </Btn>
      <button type="button" onClick={onBack} className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
        <IconArrowLeft size={14} /> Back to sign in
      </button>
    </form>
  );
}

function ChangePassword({ onBack, onDone }: { onBack: () => void; onDone: (msg: string) => void }) {
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await apiFetch("/api/auth/change", { method: "POST", json: { email: email.trim(), currentPassword, newPassword, securityQuestion, securityAnswer } });
      onDone("Your password has been changed. Please sign in with your new password.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <label className="mb-3 block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
        <input className={inputCls} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </label>
      <label className="mb-3 block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Current password</span>
        <input className={inputCls} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
      </label>
      <label className="mb-3 block">
        <span className="mb-1 block text-sm font-medium text-slate-700">New password (min 8 characters)</span>
        <input className={inputCls} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
      </label>
      <div className="mb-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <IconKey size={14} /> Optional — security question for future password resets
        </div>
        <input className={`${inputCls} mb-2`} placeholder="e.g. What was the name of your first school?" value={securityQuestion} onChange={(e) => setSecurityQuestion(e.target.value)} />
        <input className={inputCls} placeholder="Answer (case-insensitive)" value={securityAnswer} onChange={(e) => setSecurityAnswer(e.target.value)} />
      </div>
      {err && <Notice>{err}</Notice>}
      <Btn type="submit" className="mt-3 w-full" disabled={busy}>
        {busy ? "Please wait…" : "Change password"}
        <IconArrowRight size={16} className="ml-1" />
      </Btn>
      <button type="button" onClick={onBack} className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
        <IconArrowLeft size={14} /> Back to sign in
      </button>
    </form>
  );
}
