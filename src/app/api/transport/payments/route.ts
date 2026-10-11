import { readJson, route } from "@/lib/api";
import { createPayment, listPayments } from "@/lib/transport";

export const dynamic = "force-dynamic";

// Administrator only
export const GET = route("transport.manage", async ({ req }) => listPayments(req.nextUrl.searchParams));
export const POST = route("transport.manage", async ({ req, actor }) => createPayment(await readJson(req), actor));
