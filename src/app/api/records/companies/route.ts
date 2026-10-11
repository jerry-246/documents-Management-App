import { asc, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { records } from "@/db/schema";
import { route } from "@/lib/api";

export const dynamic = "force-dynamic";

// Distinct company names for the form's autocomplete
export const GET = route("records.view", async () => {
  const rows = await db.selectDistinct({ c: records.companyName }).from(records).where(isNotNull(records.companyName)).orderBy(asc(records.companyName));
  return { rows: rows.map((r) => r.c!).filter(Boolean) };
});
