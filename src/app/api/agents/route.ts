import { HttpError, readJson, route } from "@/lib/api";
import { can } from "@/lib/auth";
import { agentOptions, createAgent, listAgents } from "@/lib/agents";

export const dynamic = "force-dynamic";

export const GET = route(null, async ({ req, actor }) => {
  const sp = req.nextUrl.searchParams;
  // ?options=1 → dropdown list for record forms / filters (any signed-in user)
  if (sp.get("options") === "1") return agentOptions(sp.get("all") === "1");
  if (!can(actor, "agents.manage")) throw new HttpError(403, "You do not have permission to do this.");
  return listAgents(sp);
});

export const POST = route("agents.manage", async ({ req, actor }) => createAgent(await readJson(req), actor));
