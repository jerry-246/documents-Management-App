"use client";
import { useState } from "react";
import { fmtDateTime } from "@/lib/time";
import { PERMISSIONS, type Permission } from "@/lib/perms";
import { ApiError, apiFetch, Badge, Btn, Card, ErrorBox, Field, inputCls, Loading, Modal, PageHeader, TableWrap, tdCls, thCls, useApi, useSession, useUI } from "@/components/ui";
import { IconKey, IconPlus, IconShieldCheck } from "@/components/icons";

interface U {
  id: number;
  name: string;
  email: string;
  position: string | null;
  role: string;
  status: string;
  permissions: string[] | null;
  effective: string[];
  securityQuestion: string | null;
  createdAt: string;
}
const ROLE_TONE: Record<string, string> = { admin: "purple", staff: "blue", viewer: "slate" };

const PERM_GROUPS: { title: string; perms: (keyof typeof PERMISSIONS)[] }[] = [
  { title: "Records", perms: ["records.view", "records.create", "records.edit", "records.move", "records.archive", "records.delete", "records.import", "records.documents"] },
  { title: "Reports & Export", perms: ["reports.view", "reports.export"] },
  { title: "Monitoring", perms: ["expiry.view", "errors.view", "errors.resolve"] },
  { title: "Emails", perms: ["emails.view", "emails.manage"] },
  { title: "Administration", perms: ["audit.view", "users.manage", "settings.manage"] },
];

export default function UsersPage() {
  const { data, loading, error, reload } = useApi<{ rows: U[] }>("/api/users");
  const { user } = useSession();
  const { toast } = useUI();
  const [edit, setEdit] = useState<Partial<U & { password: string; securityAnswer: string }> | null>(null);
  const [permsUser, setPermsUser] = useState<U | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      if (edit.id)
        await apiFetch(`/api/users/${edit.id}`, {
          method: "PATCH",
          json: { name: edit.name, position: edit.position ?? "", role: edit.role, status: edit.status, password: edit.password || undefined, securityQuestion: edit.securityQuestion ?? "", securityAnswer: edit.securityAnswer || undefined },
        });
      else await apiFetch("/api/users", { method: "POST", json: edit });
      toast(edit.id ? "User updated." : "User created.");
      setEdit(null);
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function openPerms(u: U) {
    setPermsUser(u);
    setSel(new Set(u.effective));
  }
  async function savePerms() {
    if (!permsUser) return;
    setBusy(true);
    try {
      await apiFetch(`/api/users/${permsUser.id}`, { method: "PATCH", json: { permissions: [...sel] } });
      toast("Permissions updated.");
      setPermsUser(null);
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }
  async function resetPerms() {
    if (!permsUser) return;
    setBusy(true);
    try {
      await apiFetch(`/api/users/${permsUser.id}`, { method: "PATCH", json: { permissions: null } });
      toast("Reset to role defaults.");
      setPermsUser(null);
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }
  const toggle = (p: string) => setSel((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Create accounts and fine-tune exactly what each person can do across the app."
        actions={
          <Btn onClick={() => setEdit({ role: "staff", status: "active" })}>
            <IconPlus size={16} /> Add user
          </Btn>
        }
      />
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card className="!p-0">
        {loading && !data ? (
          <Loading />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>{["Name", "Position", "Email", "Role", "Status", "Created", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.rows.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className={`${tdCls} font-semibold`}>
                      {u.name}
                      {u.id === user?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                    </td>
                    <td className={tdCls}>{u.position || <span className="text-xs text-red-500">Not set</span>}</td>
                    <td className={tdCls}>{u.email}</td>
                    <td className={tdCls}><Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge></td>
                    <td className={tdCls}><Badge tone={u.status === "active" ? "green" : "red"}>{u.status}</Badge></td>
                    <td className={tdCls}>{fmtDateTime(u.createdAt)}</td>
                    <td className={tdCls}>
                      <div className="flex justify-end gap-2">
                        {u.role !== "admin" && (
                          <Btn small variant="secondary" onClick={() => openPerms(u)}>
                            <IconShieldCheck size={15} /> Permissions{u.permissions ? "" : " *"}
                          </Btn>
                        )}
                        <Btn small variant="secondary" onClick={() => setEdit({ ...u, password: "", securityAnswer: "" })}>
                          Edit
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <p className="mt-2 text-xs text-slate-500">A <span className="font-semibold">*</span> means the person uses their role&apos;s default permissions. Open Permissions to customise, or reset them to the role default.</p>

      {edit && (
        <Modal title={edit.id ? "Edit user" : "Add user"} onClose={() => setEdit(null)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input className={inputCls} value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Position" hint="e.g. Clearing Officer, Accountant">
              <input className={inputCls} value={edit.position ?? ""} onChange={(e) => setEdit({ ...edit, position: e.target.value })} />
            </Field>
            {!edit.id && (
              <Field label="Email">
                <input type="email" className={inputCls} value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </Field>
            )}
            <Field label="Role">
              <select className={inputCls} value={edit.role ?? "staff"} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                <option value="staff">Staff</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Administrator</option>
              </select>
            </Field>
            {edit.id && (
              <Field label="Status">
                <select className={inputCls} value={edit.status ?? "active"} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </Field>
            )}
            <Field label={edit.id ? "Reset password (leave blank to keep)" : "Password"} hint="At least 8 characters">
              <input type="password" autoComplete="new-password" className={inputCls} value={edit.password ?? ""} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
            </Field>
          </div>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <IconKey size={16} /> Password recovery (optional)
            </div>
            <p className="mb-2 text-xs text-slate-500">Set a secret question so this person can reset their own password from the sign-in screen.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Security question">
                <input className={inputCls} placeholder="e.g. First school you attended" value={edit.securityQuestion ?? ""} onChange={(e) => setEdit({ ...edit, securityQuestion: e.target.value })} />
              </Field>
              <Field label="Answer" hint={edit.id ? "Leave blank to keep the current answer" : undefined}>
                <input className={inputCls} value={edit.securityAnswer ?? ""} onChange={(e) => setEdit({ ...edit, securityAnswer: e.target.value })} />
              </Field>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setEdit(null)}>Cancel</Btn>
            <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn>
          </div>
        </Modal>
      )}

      {permsUser && (
        <Modal title={`Permissions — ${permsUser.name}`} onClose={() => setPermsUser(null)}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-slate-500">Tick exactly what {permsUser.name.split(" ")[0]} is allowed to do.</p>
            <div className="flex gap-2">
              <Btn small variant="ghost" onClick={() => setSel(new Set(PERM_GROUPS.flatMap((g) => g.perms)))}>All</Btn>
              <Btn small variant="ghost" onClick={() => setSel(new Set())}>None</Btn>
            </div>
          </div>
          <div className="grid max-h-[55vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
            {PERM_GROUPS.map((g) => (
              <div key={g.title} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{g.title}</div>
                <div className="space-y-1.5">
                  {g.perms.map((p) => (
                    <label key={p} className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={sel.has(p)} onChange={() => toggle(p)} />
                      <span>{PERMISSIONS[p]}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-2">
            <Btn variant="ghost" onClick={resetPerms} disabled={busy}>Reset to role default</Btn>
            <div className="flex gap-2">
              <Btn variant="ghost" onClick={() => setPermsUser(null)}>Cancel</Btn>
              <Btn onClick={savePerms} disabled={busy}>{busy ? "Saving…" : "Save permissions"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
