"use client";
import { useRef, useState } from "react";
import { apiFetch, Badge, Btn, Empty, ErrorBox, inputCls, Loading, TableWrap, tdCls, thCls, useApi, useSession, useUI } from "./ui";
import { fmtDateTime } from "@/lib/time";
import { IconFile, IconTrash, IconUpload } from "./icons";

interface DocFile {
  id: number;
  docType: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedByName: string | null;
  uploadedByPosition: string | null;
  createdAt: string;
}
interface Payload {
  documents: DocFile[];
  storageConfigured: boolean;
}

const TYPE_LABEL: Record<string, string> = { IM7: "IM7 (S)", IM4: "IM4 (C)", EXIT: "Exit (X)" };

function fmtSize(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function RecordDocuments({ recordId, archived }: { recordId: number; archived?: boolean }) {
  const { can } = useSession();
  const { toast, confirm } = useUI();
  const { data, loading, error, reload } = useApi<Payload>(`/api/records/${recordId}/documents`);
  const [docType, setDocType] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canManage = can("records.documents") && !archived;

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("docType", docType);
    setBusy(true);
    try {
      await apiFetch(`/api/records/${recordId}/documents`, { method: "POST", body: form });
      toast("File uploaded.");
      if (fileRef.current) fileRef.current.value = "";
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function download(d: DocFile) {
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/documents/${d.id}`);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Download failed", "error");
    }
  }

  async function remove(d: DocFile) {
    if (!(await confirm({ title: "Delete this file?", message: `“${d.fileName}” will be removed permanently.`, danger: true, confirmText: "Delete" }))) return;
    try {
      await apiFetch(`/api/documents/${d.id}`, { method: "DELETE" });
      toast("File deleted.");
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox>{error ?? "Could not load files"}</ErrorBox>;

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Document type</label>
            <select className={inputCls} value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="">General attachment</option>
              <option value="IM7">IM7 (S)</option>
              <option value="IM4">IM4 (C)</option>
              <option value="EXIT">Exit (X)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">File</label>
            <input
              ref={fileRef}
              type="file"
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.tif,.tiff,.doc,.docx,.xls,.xlsx,.txt,.csv"
            />
          </div>
          <Btn onClick={upload} disabled={busy}>
            <IconUpload size={16} /> {busy ? "Uploading…" : "Upload"}
          </Btn>
          {!data.storageConfigured && <span className="text-xs text-amber-600">Storage not configured — ask an administrator.</span>}
        </div>
      )}

      {data.documents.length === 0 ? (
        <Empty>No files uploaded yet.</Empty>
      ) : (
        <TableWrap>
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                {["File", "Type", "Size", "Uploaded by", "Uploaded", ""].map((h) => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.documents.map((d) => (
                <tr key={d.id}>
                  <td className={tdCls}>
                    <button type="button" onClick={() => download(d)} className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:underline">
                      <IconFile size={15} className="shrink-0" /> {d.fileName}
                    </button>
                  </td>
                  <td className={tdCls}>{d.docType ? <Badge tone="blue">{TYPE_LABEL[d.docType] ?? d.docType}</Badge> : <span className="text-slate-400">General</span>}</td>
                  <td className={tdCls}>{fmtSize(d.sizeBytes)}</td>
                  <td className={tdCls}>
                    {d.uploadedByName ?? "—"}
                    {d.uploadedByPosition ? <span className="text-xs text-slate-400"> ({d.uploadedByPosition})</span> : null}
                  </td>
                  <td className={tdCls}>{fmtDateTime(d.createdAt)}</td>
                  <td className={`${tdCls} text-right`}>
                    {canManage && (
                      <Btn small variant="ghost" onClick={() => remove(d)}>
                        <IconTrash size={14} /> Delete
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
