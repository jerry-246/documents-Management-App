import { NextRequest, NextResponse } from "next/server";
import { runDueJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

// Optional external trigger (e.g. system cron / uptime pinger). The in-process scheduler already
// runs every minute; this endpoint is a backup. Requires CRON_SECRET.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || given !== secret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await runDueJobs();
  return NextResponse.json({ ok: true });
}
export const GET = handle;
export const POST = handle;
