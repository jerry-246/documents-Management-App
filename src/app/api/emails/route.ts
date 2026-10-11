import { route } from "@/lib/api";
import { queryEmails } from "@/lib/lists";

export const dynamic = "force-dynamic";
export const GET = route("emails.view", async ({ req }) => queryEmails(req.nextUrl.searchParams));
