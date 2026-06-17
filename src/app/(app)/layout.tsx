import { cookies } from "next/headers";
import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { FlashToast } from "@/components/flash-toast";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { OverdueBanner } from "@/components/overdue-banner";
import { getOverdueInfo } from "@/lib/billing";
import { requireProfile } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const overdue = await getOverdueInfo(profile.company_id);
  const impersonating = (await cookies()).get("impersonation_origin") != null;

  // Contadores del sidebar del superadmin: leads nuevos + solicitudes de
  // sucursal pendientes (a nivel plataforma).
  let sidebarBadges: Record<string, number> = {};
  if (profile.role === "super_admin") {
    const admin = createAdminClient();
    const [{ count: newLeads }, { count: pendingBranchReqs }] =
      await Promise.all([
        admin
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("status", "new"),
        admin
          .from("branch_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
    sidebarBadges = {
      "/super-admin/leads": newLeads ?? 0,
      "/super-admin/branch-requests": pendingBranchReqs ?? 0,
    };
  }

  return (
    <div className="flex h-full min-h-screen w-full">
      <AppSidebar profile={profile} badges={sidebarBadges} />

      <main className="flex flex-1 flex-col overflow-y-auto bg-background">
        {impersonating && (
          <ImpersonationBanner
            name={fullName(profile.first_name, profile.last_name)}
            role={profile.role}
          />
        )}
        <div className="mx-auto w-full max-w-7xl flex-1 px-8 py-8">
          {overdue && (
            <div className="mb-6">
              <OverdueBanner role={profile.role} info={overdue} />
            </div>
          )}
          {children}
        </div>
      </main>

      <Suspense fallback={null}>
        <FlashToast />
      </Suspense>
    </div>
  );
}
