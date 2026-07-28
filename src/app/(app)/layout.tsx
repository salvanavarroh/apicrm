import { cookies } from "next/headers";
import { Suspense } from "react";

import { AppContent } from "@/components/app-content";
import { AppSidebar } from "@/components/app-sidebar";
import { FlashToast } from "@/components/flash-toast";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { OverdueBanner } from "@/components/overdue-banner";
import { getOverdueInfo } from "@/lib/billing";
import { requireProfile } from "@/lib/auth";
import { fullName } from "@/lib/leads";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Mapea las categorías de notificación sin leer al href de la sección del menú,
// según el rol, para mostrar el contador donde corresponde.
function badgeHrefs(role: string): Partial<Record<string, string>> {
  switch (role) {
    case "manager":
    case "supervisor":
      return { sales: "/manager/sales", leads: "/manager/leads" };
    case "sales":
      return { sales: "/sales/sales", leads: "/sales/leads" };
    case "admin":
      return { sales: "/admin/sales", leads: "/admin/leads" };
    case "data_provider":
      return { leads: "/data-provider/leads" };
    default:
      return {};
  }
}

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
    // Los "Leads" del SuperAdmin son las solicitudes de demo desde la landing
    // (commercial_leads), NO los leads operativos de las concesionarias.
    const [{ count: newLeads }, { count: pendingBranchReqs }] =
      await Promise.all([
        admin
          .from("commercial_leads")
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
  } else {
    // Contadores por sección = notificaciones sin leer por categoría.
    const supabase = await createClient();
    const { data: unread } = await supabase
      .from("notifications")
      .select("category")
      .is("read_at", null);
    const byCat: Record<string, number> = {};
    for (const n of unread ?? []) byCat[n.category] = (byCat[n.category] ?? 0) + 1;
    const hrefs = badgeHrefs(profile.role);
    for (const [cat, count] of Object.entries(byCat)) {
      const href = hrefs[cat];
      if (href) sidebarBadges[href] = count;
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AppSidebar profile={profile} badges={sidebarBadges} />

      {/* Sólo esta sección scrollea; el menú queda fijo al 100% del alto. */}
      <main className="flex flex-1 flex-col overflow-y-auto bg-background">
        {impersonating && (
          <ImpersonationBanner
            name={fullName(profile.first_name, profile.last_name)}
            role={profile.role}
          />
        )}
        <AppContent
          banner={overdue ? <OverdueBanner role={profile.role} info={overdue} /> : null}
        >
          {children}
        </AppContent>
      </main>

      <Suspense fallback={null}>
        <FlashToast />
      </Suspense>
    </div>
  );
}
