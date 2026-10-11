import { HttpError, readJson, route, str } from "@/lib/api";
import { runExpiryAlerts, sendReport } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export const POST = route("emails.manage", async ({ req, actor }) => {
  const job = str((await readJson(req)).job);
  if (job === "expiry") return { result: await runExpiryAlerts() };
  if (job === "daily" || job === "weekly" || job === "monthly") {
    const r = await sendReport(job, undefined, actor);
    if (r.skipped) throw new HttpError(400, "No recipients configured. Add recipients in Email settings first.");
    if (!r.ok) throw new HttpError(502, `Report email failed: ${r.error}`);
    return { result: r };
  }
  throw new HttpError(400, "Unknown job");
});
