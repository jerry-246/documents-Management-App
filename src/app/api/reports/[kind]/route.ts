import { HttpError, route } from "@/lib/api";
import { analytics, monthlyReport, periodReport } from "@/lib/reports";
import { isISODate, todayISO } from "@/lib/time";

export const dynamic = "force-dynamic";

export const GET = route("reports.view", async ({ req, params }) => {
  const sp = req.nextUrl.searchParams;
  if (params.kind === "analytics") return analytics();
  if (params.kind === "monthly") {
    const t = todayISO();
    const month = Number(sp.get("month")) || Number(t.slice(5, 7));
    const year = Number(sp.get("year")) || Number(t.slice(0, 4));
    if (month < 1 || month > 12 || year < 2000 || year > 2100) throw new HttpError(400, "Invalid month or year");
    return monthlyReport(year, month);
  }
  if (params.kind === "period") {
    const from = sp.get("from") ?? todayISO();
    const to = sp.get("to") ?? from;
    if (!isISODate(from) || !isISODate(to) || from > to) throw new HttpError(400, "Invalid date range");
    return periodReport(from, to);
  }
  throw new HttpError(404, "Unknown report");
});
