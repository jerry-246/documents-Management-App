import { route } from "@/lib/api";
import { queryErrors } from "@/lib/lists";

export const dynamic = "force-dynamic";
export const GET = route("errors.view", async ({ req }) => queryErrors(req.nextUrl.searchParams));
