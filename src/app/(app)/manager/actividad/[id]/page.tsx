import {
  SellerActivityScreen,
  defaultActivityRange,
} from "@/components/activity/activity-screens";
import { actingManagerId, requireRole } from "@/lib/auth";

export default async function ManagerActividadDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["manager", "supervisor"]);
  if (!profile.company_id) return null;
  const sp = await searchParams;
  const fallback = defaultActivityRange();

  return (
    <SellerActivityScreen
      scope={{
        companyId: profile.company_id,
        managerId: actingManagerId(profile),
      }}
      basePath="/manager/actividad"
      userId={id}
      from={sp.from || fallback.from}
      to={sp.to || fallback.to}
    />
  );
}
