import { route } from "@/lib/api";
import { transporterBalances } from "@/lib/transport";

export const dynamic = "force-dynamic";
export const GET = route("transport.manage", async () => transporterBalances());
