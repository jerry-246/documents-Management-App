import { HttpError, route } from "@/lib/api";
import { deleteDocument, documentDownloadUrl } from "@/lib/documents";

export const dynamic = "force-dynamic";

const idOf = (p: Record<string, string>) => {
  const id = Number(p.id);
  if (!Number.isInteger(id)) throw new HttpError(400, "Invalid document id");
  return id;
};

// Returns a short-lived signed URL for the file.
export const GET = route("records.view", ({ params }) => documentDownloadUrl(Number(idOf(params))));

export const DELETE = route("records.documents", async ({ actor, params }) => {
  await deleteDocument(idOf(params), actor);
  return { ok: true };
});
