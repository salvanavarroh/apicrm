import { redirect } from "next/navigation";

import { homePathForRole, requireProfile } from "@/lib/auth";

/**
 * `/dashboard` es una URL histórica: cada rol tiene su propio inicio
 * (`/admin`, `/manager`, `/sales`, …). Antes mostraba una tarjeta "En
 * construcción", que es lo peor que puede ver alguien que llega acá desde un
 * link viejo o un bookmark. Redirige al inicio que le corresponde.
 */
export default async function DashboardPage() {
  const profile = await requireProfile();
  redirect(homePathForRole(profile.role));
}
