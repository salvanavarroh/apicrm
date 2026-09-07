import {
  TeamActivityScreen,
  defaultActivityRange,
} from "@/components/activity/activity-screens";
import { requireRole } from "@/lib/auth";

export default async function AdminActividadPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const profile = await requireRole(["admin"]);
  if (!profile.company_id) return null;
  const sp = await searchParams;
  const fallback = defaultActivityRange();

  return (
    <TeamActivityScreen
      scope={{ companyId: profile.company_id, managerId: null }}
      basePath="/admin/actividad"
      from={sp.from || fallback.from}
      to={sp.to || fallback.to}
    />
  );
}
