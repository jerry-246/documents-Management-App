import { HttpError, route, str } from "@/lib/api";
import { listDocuments, uploadDocument } from "@/lib/documents";

export const dynamic = "force-dynamic";

const idOf = (p: Record<string, string>) => {
  const id = Number(p.id);
  if (!Number.isInteger(id)) throw new HttpError(400, "Invalid record id");
  return id;
};

// Viewing documents only needs record-view access.
export const GET = route("records.view", ({ params }) => listDocuments(idOf(params)));

// Uploading / deleting requires the documents permission.
export const POST = route("records.documents", async ({ req, actor, params }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (typeof file !== "object" || file === null || typeof (file as Blob).arrayBuffer !== "function")
    throw new HttpError(400, "No file was provided.");
  const docType = str(form.get("docType")).toUpperCase();
  return uploadDocument(idOf(params), file as File, docType, actor);
});
