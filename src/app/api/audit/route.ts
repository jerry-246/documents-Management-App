import { route } from "@/lib/api";
import { queryAudit } from "@/lib/lists";

export const dynamic = "force-dynamic";
export const GET = route("audit.view", async ({ req, actor }) => queryAudit(req.nextUrl.searchParams, actor.role === "admin"));
