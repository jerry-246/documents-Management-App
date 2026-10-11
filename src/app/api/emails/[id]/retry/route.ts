import { db } from "@/db";
import { audit } from "@/lib/audit";
import { HttpError, route } from "@/lib/api";
import { retryEmail } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export const POST = route("emails.manage", async ({ actor, params }) => {
  const id = Number(params.id);
  const r = await retryEmail(id);
  await audit(db, { actor, action: "email_retry", newValue: `email #${id}: ${r.ok ? "sent" : "failed"}`, reason: r.error ?? null });
  if (!r.ok) throw new HttpError(502, `Retry failed: ${r.error}`);
  return { ok: true };
});
