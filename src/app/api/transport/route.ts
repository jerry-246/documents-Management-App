import { route } from "@/lib/api";
import { queryTransport } from "@/lib/transport";

export const dynamic = "force-dynamic";
export const GET = route("transport.manage", async ({ req }) => queryTransport(req.nextUrl.searchParams));
