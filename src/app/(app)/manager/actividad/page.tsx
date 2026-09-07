import {
  TeamActivityScreen,
  defaultActivityRange,
} from "@/components/activity/activity-screens";
import { actingManagerId, requireRole } from "@/lib/auth";

export default async function ManagerActividadPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  // El supervisor ve el equipo de su gerente padre, como en el resto de sus
  // pantallas.
  const profile = await requireRole(["manager", "supervisor"]);
  if (!profile.company_id) return null;
  const sp = await searchParams;
  const fallback = defaultActivityRange();

  return (
    <TeamActivityScreen
      scope={{
        companyId: profile.company_id,
        managerId: actingManagerId(profile),
      }}
      basePath="/manager/actividad"
      from={sp.from || fallback.from}
      to={sp.to || fallback.to}
    />
  );
}
