import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { readJson, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(null, async ({ actor }) => {
  const rows = await db.select().from(notifications).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(200);
  const out = rows.map((n) => ({ id: n.id, kind: n.kind, message: n.message, link: n.link, createdAt: n.createdAt, read: n.readBy.includes(actor.id) }));
  return { rows: out, unread: out.filter((n) => !n.read).length };
});

export const POST = route(null, async ({ req, actor }) => {
  const b = await readJson(req);
  const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(Number.isInteger) : null;
  await db.execute(
    sql`update notifications set read_by = array_append(read_by, ${actor.id}) where not (${actor.id} = any(read_by)) ${
      ids ? sql`and id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql``
    }`,
  );
  return { ok: true };
});
