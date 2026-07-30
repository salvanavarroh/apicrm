import { requireRole } from "@/lib/auth";
import { AdsPerformanceView } from "@/components/ads/ads-performance";
import { getAdsPerformance } from "@/app/(app)/admin/ads/actions";

export default async function AdsPage() {
  await requireRole(["admin", "manager"]);
  const initial = await getAdsPerformance();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Rendimiento de Ads</h1>
        <p className="text-sm text-muted-foreground">
          Métricas reales de cada anuncio (inversión, clics, CTR, CPC) cruzadas con
          el embudo del CRM: leads, ventas y facturación atribuida, costo por lead y
          ROAS real.
        </p>
      </header>
      <AdsPerformanceView initial={initial} />
    </div>
  );
}
