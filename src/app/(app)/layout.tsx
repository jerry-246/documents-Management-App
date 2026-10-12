import type { ReactNode } from "react";
import AppShell from "@/components/AppShell";
import ClientGate from "@/components/ClientGate";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  // No cookie (e.g. blocked in an embedded preview) → authenticate in the browser with the stored token.
  if (!user) return <ClientGate>{children}</ClientGate>;
  const permissions = user.permissions ?? [];
  return (
    <AppShell user={{ id: user.id, name: user.name, email: user.email, role: user.role, position: user.position ?? null }} permissions={permissions}>
      {children}
    </AppShell>
  );
}
