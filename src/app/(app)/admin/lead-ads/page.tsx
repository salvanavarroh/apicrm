import { redirect } from "next/navigation";

// Los formularios de Lead Ads se gestionan desde la pantalla unificada de Integraciones.
export default function LeadAdsPage() {
  redirect("/admin/integraciones?tab=leadads");
}
