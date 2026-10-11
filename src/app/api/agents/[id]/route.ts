import { HttpError, readJson, route, str } from "@/lib/api";
import { deleteAgent, updateAgent } from "@/lib/agents";

export const dynamic = "force-dynamic";

const idOf = (p: Record<string, string>) => {
  const id = Number(p.id);
  if (!Number.isInteger(id)) throw new HttpError(400, "Invalid agent id");
  return id;
};

// Administrator only
export const PATCH = route("agents.manage", async ({ req, actor, params }) => updateAgent(idOf(params), await readJson(req), actor));
export const DELETE = route("agents.manage", async ({ req, actor, params }) => deleteAgent(idOf(params), str((await readJson(req)).reason), actor));
