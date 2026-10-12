import { route } from "@/lib/api";
import { getRules, getStages, getValidationSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = route(null, async ({ actor }) => {
  const [rules, stages, v] = await Promise.all([getRules(), getStages(), getValidationSettings()]);
  return {
    user: { id: actor.id, name: actor.name, email: actor.email, role: actor.role, position: actor.position ?? null },
    permissions: actor.permissions ?? [],
    rules,
    stages: stages.filter((s) => s.active),
    caseSensitive: v.caseSensitive,
  };
});
