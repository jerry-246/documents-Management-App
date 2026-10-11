import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recordDocuments, records } from "@/db/schema";
import { audit, type Actor } from "./audit";
import { HttpError } from "./api";
import { createDownloadUrl, removeObject, storageConfigured, uploadObject } from "./storage";

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024; // 20 MB
export const DOCUMENT_TYPES = ["IM7", "IM4", "EXIT"] as const;

// Common document / image formats accepted for upload.
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/tiff",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

export interface DocumentView {
  id: number;
  docType: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: number | null;
  uploadedByName: string | null;
  uploadedByPosition: string | null;
  createdAt: string;
}

function toView(r: typeof recordDocuments.$inferSelect): DocumentView {
  return {
    id: r.id,
    docType: r.docType,
    fileName: r.fileName,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    uploadedBy: r.uploadedBy,
    uploadedByName: r.uploadedByName,
    uploadedByPosition: r.uploadedByPosition,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listDocuments(recordId: number): Promise<{ documents: DocumentView[]; storageConfigured: boolean }> {
  const rows = await db
    .select()
    .from(recordDocuments)
    .where(eq(recordDocuments.recordId, recordId))
    .orderBy(recordDocuments.createdAt);
  return { documents: rows.map(toView), storageConfigured: storageConfigured() };
}

function safeName(name: string): string {
  const base = name.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return (base || "file").slice(-120);
}

export async function uploadDocument(recordId: number, file: File, docType: string, actor: Actor): Promise<DocumentView> {
  if (!storageConfigured())
    throw new HttpError(503, "File storage is not configured. Ask an administrator to set the Supabase Storage keys.");
  if (!Number.isInteger(recordId)) throw new HttpError(400, "Invalid record id");

  const [record] = await db.select({ id: records.id }).from(records).where(eq(records.id, recordId)).limit(1);
  if (!record) throw new HttpError(404, "Record not found");

  if (!file.size) throw new HttpError(400, "The selected file is empty.");
  if (file.size > MAX_DOCUMENT_BYTES) throw new HttpError(400, `File is too large (max ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB).`);
  if (file.type && !ALLOWED_MIME.has(file.type)) throw new HttpError(400, "Unsupported file type. Upload a PDF, image, Office, text or CSV file.");

  const type = docType.trim().toUpperCase();
  const resolvedType = (DOCUMENT_TYPES as readonly string[]).includes(type) ? type : null;

  const storagePath = `${recordId}/${Date.now()}-${safeName(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadObject(storagePath, buffer, file.type || "application/octet-stream");

  const [saved] = await db
    .insert(recordDocuments)
    .values({
      recordId,
      docType: resolvedType,
      fileName: file.name,
      storagePath,
      mimeType: file.type || null,
      sizeBytes: file.size,
      uploadedBy: actor.id,
      uploadedByName: actor.name,
      uploadedByPosition: actor.position ?? null,
    })
    .returning();

  await audit(db, { actor, recordId, action: "document_upload", fieldName: resolvedType, newValue: file.name });
  return toView(saved);
}

export async function deleteDocument(id: number, actor: Actor): Promise<void> {
  const [row] = await db.select().from(recordDocuments).where(eq(recordDocuments.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Document not found");
  if (storageConfigured()) await removeObject(row.storagePath);
  await db.delete(recordDocuments).where(eq(recordDocuments.id, id));
  await audit(db, { actor, recordId: row.recordId, action: "document_delete", fieldName: row.docType, oldValue: row.fileName });
}

export async function documentDownloadUrl(id: number): Promise<{ url: string; fileName: string }> {
  const [row] = await db.select().from(recordDocuments).where(eq(recordDocuments.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Document not found");
  if (!storageConfigured()) throw new HttpError(503, "File storage is not configured.");
  const url = await createDownloadUrl(row.storagePath);
  return { url, fileName: row.fileName };
}
