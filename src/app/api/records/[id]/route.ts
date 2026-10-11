import { HttpError, readJson, route, str } from "@/lib/api";
import { deleteRecordPermanently, recordDetail, updateRecord } from "@/lib/records";

export const dynamic = "force-dynamic";

const idOf = (p: Record<string, string>) => {
  const id = Number(p.id);
  if (!Number.isInteger(id)) throw new HttpError(400, "Invalid record id");
  return id;
};

export const GET = route("records.view", async ({ params, actor }) => recordDetail(idOf(params), actor.role === "admin"));

export const PATCH = route("records.edit", async ({ req, actor, params }) => {
  const body = await readJson(req);
  return updateRecord(idOf(params), body, actor, { reason: str(body.reason), confirmDuplicate: body.confirmDuplicate === true });
});

export const DELETE = route("records.delete", async ({ req, actor, params }) => {
  const body = await readJson(req);
  await deleteRecordPermanently(idOf(params), str(body.reason), actor);
  return { ok: true };
});
