"use client";
import { useState } from "react";
import { fmtDateTime } from "@/lib/time";
import { ApiError, apiFetch, Badge, Btn, Card, ErrorBox, Field, inputCls, Loading, Modal, PageHeader, TableWrap, tdCls, thCls, useApi, useSession, useUI } from "@/components/ui";

interface U { id: number; name: string; email: string; position: string | null; role: string; status: string; createdAt: string }
const ROLE_TONE: Record<string, string> = { admin: "purple", staff: "blue", viewer: "slate" };

export default function UsersPage() {
  const { data, loading, error, reload } = useApi<{ rows: U[] }>("/api/users");
  const { user } = useSession();
  const { toast } = useUI();
  const [edit, setEdit] = useState<Partial<U & { password: string }> | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      if (edit.id) await apiFetch(`/api/users/${edit.id}`, { method: "PATCH", json: { name: edit.name, position: edit.position ?? "", role: edit.role, status: edit.status, password: edit.password || undefined } });
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

  return (
    <>
      <PageHeader title="Users" subtitle="Administrator · Staff · Viewer (permissions are configurable in Settings)" actions={<Btn onClick={() => setEdit({ role: "staff", status: "active" })}>＋ Add user</Btn>} />
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card className="!p-0">
        {loading && !data ? <Loading /> : (
          <TableWrap>
            <table className="w-full min-w-[600px]">
              <thead><tr>{["Name", "Position", "Email", "Role", "Status", "Created", ""].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data?.rows.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className={`${tdCls} font-semibold`}>{u.name}{u.id === user?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}</td>
                    <td className={tdCls}>{u.position || <span className="text-xs text-red-500">Not set</span>}</td>
                    <td className={tdCls}>{u.email}</td>
                    <td className={tdCls}><Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge></td>
                    <td className={tdCls}><Badge tone={u.status === "active" ? "green" : "red"}>{u.status}</Badge></td>
                    <td className={tdCls}>{fmtDateTime(u.createdAt)}</td>
                    <td className={tdCls}><Btn small variant="secondary" onClick={() => setEdit({ ...u, password: "" })}>Edit</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      {edit && (
        <Modal title={edit.id ? `Edit ${edit.name}` : "Add user"} onClose={() => setEdit(null)} small>
          <div className="space-y-3">
            <Field label="Name" required><input className={inputCls} value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Position / job title" required hint="Saved on every record this person creates.">
              <input className={inputCls} value={edit.position ?? ""} onChange={(e) => setEdit({ ...edit, position: e.target.value })} placeholder="e.g. Clearing Officer" maxLength={120} />
            </Field>
            {!edit.id && <Field label="Email" required><input type="email" className={inputCls} value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>}
            <Field label="Role">
              <select className={inputCls} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                <option value="admin">Administrator</option><option value="staff">Staff</option><option value="viewer">Viewer</option>
              </select>
            </Field>
            {edit.id && (
              <Field label="Status">
                <select className={inputCls} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                  <option value="active">Active</option><option value="disabled">Disabled</option>
                </select>
              </Field>
            )}
            <Field label={edit.id ? "Reset password (optional)" : "Password"} required={!edit.id} hint="At least 8 characters.">
              <input type="password" autoComplete="new-password" className={inputCls} value={edit.password ?? ""} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
            </Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setEdit(null)}>Cancel</Btn>
            <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
