import { readJson, route } from "@/lib/api";
import { moveRecord } from "@/lib/records";

export const dynamic = "force-dynamic";

export const POST = route("records.move", async ({ req, actor, params }) => moveRecord(Number(params.id), await readJson(req), actor));
