import { HttpError, readJson, route, str } from "@/lib/api";
import { deletePayment, updatePayment } from "@/lib/transport";

export const dynamic = "force-dynamic";

const idOf = (p: Record<string, string>) => {
  const id = Number(p.id);
  if (!Number.isInteger(id)) throw new HttpError(400, "Invalid payment id");
  return id;
};

// Administrator only
export const PATCH = route("transport.manage", async ({ req, actor, params }) => updatePayment(idOf(params), await readJson(req), actor));
export const DELETE = route("transport.manage", async ({ req, actor, params }) => {
  await deletePayment(idOf(params), str((await readJson(req)).reason), actor);
  return { ok: true };
});
