import { readJson, route, str } from "@/lib/api";
import { setArchived } from "@/lib/records";

export const dynamic = "force-dynamic";

export const POST = route("records.archive", async ({ req, actor, params }) => {
  const b = await readJson(req);
  await setArchived(Number(params.id), b.archive !== false, str(b.reason), actor);
  return { ok: true };
});
