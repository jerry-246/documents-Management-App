import { readJson, route } from "@/lib/api";
import { can } from "@/lib/auth";
import { createRecord, filtersFromParams, getCtx, queryRecords } from "@/lib/records";

export const dynamic = "force-dynamic";

export const GET = route("records.view", async ({ req, actor }) => {
  const f = filtersFromParams(req.nextUrl.searchParams);
  f.pageSize = Math.min(200, f.pageSize ?? 25);
  f.page = f.page ?? 1;
  if (f.archived !== "0" && !(await can(actor.role, "records.archive"))) f.archived = "0";
  const { rows, total } = await queryRecords(f, await getCtx(actor.role === "admin"));
  return { rows, total, page: f.page, pageSize: f.pageSize };
});

export const POST = route("records.create", async ({ req, actor }) => {
  const body = await readJson(req);
  const record = await createRecord(body, actor, { confirmDuplicate: body.confirmDuplicate === true });
  return { record };
});
