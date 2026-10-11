import { route } from "@/lib/api";
import { expiryRows } from "@/lib/records";
import type { DocType, ExpiryStatus } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = route("expiry.view", async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const doc = sp.get("doc")?.toUpperCase();
  const status = sp.get("status") ?? undefined;
  const rows = await expiryRows({
    preset: sp.get("preset") || undefined,
    doc: doc && ["IM7", "IM4", "EXIT"].includes(doc) ? (doc as DocType) : undefined,
    status: status && ["active", "expiring_soon", "critical", "expired"].includes(status) ? (status as ExpiryStatus) : undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    includeCompleted: sp.get("includeCompleted") === "1",
    company: sp.get("company") || undefined,
  });
  return { rows };
});
