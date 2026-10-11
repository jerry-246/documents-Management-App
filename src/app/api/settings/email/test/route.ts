import { db } from "@/db";
import { audit } from "@/lib/audit";
import { HttpError, readJson, route, str } from "@/lib/api";
import { sendEmail } from "@/lib/email";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export const POST = route("settings.manage", async ({ req, actor }) => {
  const b = await readJson(req);
  const to = str(b.to) || actor.email;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new HttpError(400, "Enter a valid recipient email.");
  const r = await sendEmail({
    to: [to],
    subject: "Test email – Container Tracking System",
    html: `<p>This is a test email from the Container Tracking System, sent ${fmtDateTime(new Date())} (Africa/Kampala).</p><p>If you can read this, your email configuration works.</p>`,
    type: "test",
    label: "Test Email",
  });
  await audit(db, { actor, action: "email_test", newValue: `${to}: ${r.ok ? "sent" : "failed"}`, reason: r.error ?? null });
  if (!r.ok) throw new HttpError(502, `Test email failed: ${r.error}`);
  return { ok: true };
});
