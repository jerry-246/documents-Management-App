import { route } from "@/lib/api";
import { dashboardData } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const GET = route("records.view", async () => dashboardData());
