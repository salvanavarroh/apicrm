import {
  SellerActivityScreen,
  defaultActivityRange,
} from "@/components/activity/activity-screens";
import { requireRole } from "@/lib/auth";

export default async function AdminActividadDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;
  const sp = await searchParams;
  const fallback = defaultActivityRange();

  return (
    <SellerActivityScreen
      scope={{ companyId: profile.company_id, managerId: null }}
      basePath="/admin/actividad"
      userId={id}
      from={sp.from || fallback.from}
      to={sp.to || fallback.to}
    />
  );
}
