import { eq } from "drizzle-orm";
import { db } from "@/db";
import { validationErrors } from "@/db/schema";
import { audit } from "@/lib/audit";
import { HttpError, readJson, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export const PATCH = route("errors.resolve", async ({ req, actor, params }) => {
  const id = Number(params.id);
  const b = await readJson(req);
  const resolved = b.resolved !== false;
  const [row] = await db
    .update(validationErrors)
    .set({ resolved, resolvedBy: resolved ? actor.id : null, resolvedAt: resolved ? new Date() : null })
    .where(eq(validationErrors.id, id))
    .returning();
  if (!row) throw new HttpError(404, "Error not found");
  await audit(db, { actor, recordId: row.recordId, action: resolved ? "error_resolved" : "error_reopened", newValue: `${row.fieldName}: ${row.enteredValue}` });
  return { ok: true };
});
