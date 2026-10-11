import bcrypt from "bcryptjs";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { expiryRules, users, workflowStages } from "@/db/schema";
import { DEFAULT_RULES, DEFAULT_STAGES, getSetting, setSetting } from "./settings";
import { DOC_TYPES } from "./validation";

let started: Promise<void> | null = null;

/**
 * Idempotent bootstrap. Creates the first administrator (only from ADMIN_EMAIL / ADMIN_PASSWORD),
 * the default expiry rules and the default workflow stages. No demo/sample data is ever created.
 */
export async function ensureSeed() {
  started ??= run();
  try {
    await started;
  } catch (e) {
    started = null;
    throw e;
  }
}

async function run() {
  // First administrator — credentials come exclusively from the environment.
  const [u] = await db.select({ n: count() }).from(users);
  if (u.n === 0) {
    const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? "";
    if (!email || !password) {
      console.warn(
        "[seed] No users exist and ADMIN_EMAIL / ADMIN_PASSWORD are not set. " +
          "Set them in .env and restart to create the first administrator.",
      );
    } else {
      await db.insert(users).values({
        name: "Administrator",
        email,
        position: "Administrator",
        role: "admin",
        passwordHash: bcrypt.hashSync(password, 10),
      });
    }
  }

  // Default expiry rules (functional configuration, editable in Settings → Expiry Rules).
  const [r] = await db.select({ n: count() }).from(expiryRules);
  if (r.n === 0) await db.insert(expiryRules).values(DOC_TYPES.map((d) => ({ documentType: d, ...DEFAULT_RULES[d] })));

  // Default workflow stages (functional configuration, editable in Settings → Workflow).
  const [s] = await db.select({ n: count() }).from(workflowStages);
  if (s.n === 0) await db.insert(workflowStages).values(DEFAULT_STAGES);

  // Mark setup as done once (kept for backward compatibility; no data is seeded).
  if (!(await getSetting<boolean>("initialized", false))) await setSetting("initialized", true, null);
}
