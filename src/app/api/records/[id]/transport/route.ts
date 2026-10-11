import { HttpError, readJson, route, str } from "@/lib/api";
import { clearTransport, setTransport } from "@/lib/records";

export const dynamic = "force-dynamic";

const idOf = (p: Record<string, string>) => {
  const id = Number(p.id);
  if (!Number.isInteger(id)) throw new HttpError(400, "Invalid record id");
  return id;
};

// Administrator only (permission "transport.manage" can never be granted to other roles)
export const PUT = route("transport.manage", async ({ req, actor, params }) => setTransport(idOf(params), await readJson(req), actor));

export const DELETE = route("transport.manage", async ({ req, actor, params }) => {
  await clearTransport(idOf(params), str((await readJson(req)).reason), actor);
  return { ok: true };
});
