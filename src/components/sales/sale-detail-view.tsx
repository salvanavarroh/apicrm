import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { ValidationForm } from "@/app/(app)/admin/sales/[id]/validation-form";
import { SaleDocuments, type SaleDoc } from "@/components/sales/sale-documents";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatARS } from "@/lib/format";
import { fullName } from "@/lib/leads";

export type SaleForView = {
  id: string;
  lead_id: string;
  status: "evaluating" | "accepted" | "rejected";
  final_price: number;
  started_at: string;
  scoring_check: boolean | null;
  scoring_comment: string | null;
  documentation_check: boolean | null;
  documentation_comment: string | null;
  payment_check: boolean | null;
  payment_comment: string | null;
  general_comment: string | null;
  rejection_reason: string | null;
  commission_percent_snapshot: number | null;
  vendor: {
    first_name: string | null;
    last_name: string | null;
    commission_percent: number | null;
  } | null;
  lead: { first_name: string | null; last_name: string | null; vehicle_model: string | null } | null;
  quote: { id: string; modality: string } | null;
};

export type SaleReview = {
  id: string;
  action: string;
  reason: string | null;
  created_at: string;
  reviewer: { first_name: string | null; last_name: string | null } | null;
};

const REVIEW_LABEL: Record<string, string> = {
  approved: "Aprobada",
  rejected: "Rechazada",
  resubmitted: "Reenviada",
};

export function SaleDetailView({
  sale,
  docs,
  reviews,
  companyId,
  backHref,
  usedCarCard,
}: {
  sale: SaleForView;
  docs: SaleDoc[];
  reviews: SaleReview[];
  companyId: string;
  backHref: string;
  /** Tarjeta de la toma del usado. Se arma en el server: necesita la tasación. */
  usedCarCard?: React.ReactNode;
}) {
  const isPending = sale.status === "evaluating";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Validación de venta
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge
              variant={
                sale.status === "accepted"
                  ? "secondary"
                  : sale.status === "rejected"
                    ? "destructive"
                    : "default"
              }
            >
              {sale.status === "evaluating" && "En evaluación"}
              {sale.status === "accepted" && "Aceptada"}
              {sale.status === "rejected" && "Rechazada"}
            </Badge>
            <span>·</span>
            <span>
              Iniciada el {new Date(sale.started_at).toLocaleDateString("es-AR")}
            </span>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Detalle</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Detail
                label="Lead"
                value={sale.lead ? fullName(sale.lead.first_name, sale.lead.last_name) : "—"}
              />
              <Detail
                label="Vendedor"
                value={sale.vendor ? fullName(sale.vendor.first_name, sale.vendor.last_name) : "—"}
              />
              <Detail label="Vehículo" value={sale.lead?.vehicle_model} />
              <Detail
                label="Cotización"
                value={`#${sale.quote?.id?.slice(0, 8) ?? "—"} · ${sale.quote?.modality ?? "—"}`}
              />
              <Detail label="Monto final" value={formatARS(sale.final_price)} />
              <Detail
                label="Comisión actual del vendedor"
                value={
                  sale.vendor?.commission_percent != null
                    ? `${sale.vendor.commission_percent}%`
                    : "—"
                }
              />
            </CardContent>
          </Card>

          {usedCarCard}

          <Card>
            <CardHeader>
              <CardTitle>Documentación</CardTitle>
            </CardHeader>
            <CardContent>
              <SaleDocuments
                saleId={sale.id}
                companyId={companyId}
                docs={docs}
                canEdit
              />
            </CardContent>
          </Card>

          {isPending ? (
            <ValidationForm saleId={sale.id} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Resultado</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <CheckRow ok={!!sale.scoring_check} label="Scoring" comment={sale.scoring_comment} />
                <CheckRow ok={!!sale.documentation_check} label="Documentación" comment={sale.documentation_comment} />
                <CheckRow ok={!!sale.payment_check} label="Pago" comment={sale.payment_comment} />
                {sale.general_comment && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Observación general
                    </p>
                    <p className="whitespace-pre-line">{sale.general_comment}</p>
                  </div>
                )}
                {sale.rejection_reason && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-destructive">
                      Motivo del rechazo
                    </p>
                    <p className="whitespace-pre-line">{sale.rejection_reason}</p>
                  </div>
                )}
                {sale.commission_percent_snapshot !== null && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Comisión congelada
                    </p>
                    <p className="font-mono">{sale.commission_percent_snapshot}%</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {reviews.length > 0 && (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Historial</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {reviews.map((r) => (
                  <div key={r.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {REVIEW_LABEL[r.action] ?? r.action}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("es-AR")}
                      </span>
                    </div>
                    {r.reason && (
                      <p className="text-xs text-muted-foreground">{r.reason}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {r.reviewer ? fullName(r.reviewer.first_name, r.reviewer.last_name) : "—"}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Recordatorios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>
                Aprobar requiere los <strong>3 checks</strong> tildados.
              </p>
              <p>
                Rechazar requiere un motivo de{" "}
                <strong>al menos 10 caracteres</strong>.
              </p>
              <p>
                La comisión del vendedor queda <strong>congelada</strong> al
                aprobar.
              </p>
              <p>
                Si la rechazás, el vendedor puede subir la documentación faltante
                y <strong>reenviar la misma venta</strong>.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-medium">{value || "—"}</div>
    </div>
  );
}

function CheckRow({ ok, label, comment }: { ok: boolean; label: string; comment: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={
          ok
            ? "mt-0.5 inline-flex size-4 items-center justify-center rounded-full bg-success/20 text-[10px] text-success"
            : "mt-0.5 inline-flex size-4 items-center justify-center rounded-full bg-destructive/10 text-[10px] text-destructive"
        }
      >
        {ok ? "✓" : "✗"}
      </span>
      <div>
        <p className="font-medium">{label}</p>
        {comment && <p className="text-xs text-muted-foreground">{comment}</p>}
      </div>
    </div>
  );
}
