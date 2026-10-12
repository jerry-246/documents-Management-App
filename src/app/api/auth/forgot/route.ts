import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clientIp, errorResponse, rateLimit, readJson, str } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Step 1 of "forgot password": return the security question (if any) for the given email. */
export async function POST(req: NextRequest) {
  try {
    rateLimit(`forgot:${clientIp(req)}`, 20, 15 * 60_000);
    const b = await readJson(req);
    const email = str(b.email).toLowerCase();
    if (!email) return NextResponse.json({ hasQuestion: false });
    const [u] = await db
      .select({ status: users.status, question: users.securityQuestion, hasAnswer: users.securityAnswerHash })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (!u || u.status !== "active" || !u.question || !u.hasAnswer) return NextResponse.json({ hasQuestion: false });
    return NextResponse.json({ hasQuestion: true, question: u.question });
  } catch (e) {
    return errorResponse(e);
  }
}
