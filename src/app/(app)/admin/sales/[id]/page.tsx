import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { formatARS } from "@/lib/format";
import { fullName } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

import { ValidationForm } from "./validation-form";

export default async function AdminSaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole(["admin"]);
  const supabase = await createClient();

  const { data: sale } = await supabase
    .from("sales")
    .select(
      `
        *,
        vendor:profiles!vendor_id (first_name, last_name, commission_percent),
        lead:leads (id, first_name, last_name, phone, email, vehicle_model, vehicle_version),
        quote:quotes (id, modality, total, valid_until)
      `,
    )
    .eq("id", id)
    .eq("company_id", profile.company_id!)
    .maybeSingle();

  if (!sale) notFound();

  const isPending = sale.status === "evaluating";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/sales"
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
              Iniciada el{" "}
              {new Date(sale.started_at).toLocaleDateString("es-AR")}
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
                value={
                  sale.lead
                    ? fullName(sale.lead.first_name, sale.lead.last_name)
                    : "—"
                }
              />
              <Detail
                label="Vendedor"
                value={
                  sale.vendor
                    ? fullName(sale.vendor.first_name, sale.vendor.last_name)
                    : "—"
                }
              />
              <Detail label="Vehículo" value={sale.lead?.vehicle_model} />
              <Detail
                label="Cotización"
                value={`#${sale.quote?.id?.slice(0, 8) ?? "—"} · ${sale.quote?.modality ?? "—"}`}
              />
              <Detail
                label="Monto final"
                value={formatARS(sale.final_price)}
              />
              <Detail
                label="Comisión actual del vendedor"
                value={
                  sale.vendor?.commission_percent !== null &&
                  sale.vendor?.commission_percent !== undefined
                    ? `${sale.vendor.commission_percent}%`
                    : "—"
                }
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
                <CheckRow
                  ok={!!sale.scoring_check}
                  label="Scoring"
                  comment={sale.scoring_comment}
                />
                <CheckRow
                  ok={!!sale.documentation_check}
                  label="Documentación"
                  comment={sale.documentation_comment}
                />
                <CheckRow
                  ok={!!sale.payment_check}
                  label="Pago"
                  comment={sale.payment_comment}
                />
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
                    <p className="font-mono">
                      {sale.commission_percent_snapshot}%
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Recordatorios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>
              Aprobar requiere los <strong>3 checks</strong> tildados.
            </p>
            <p>
              Rechazar requiere un comentario de{" "}
              <strong>al menos 10 caracteres</strong>.
            </p>
            <p>
              La comisión del vendedor queda{" "}
              <strong>congelada</strong> al aprobar — cambios futuros no afectan
              esta venta.
            </p>
            <p>
              Una venta rechazada permite reiniciar la operación con una nueva
              venta.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-medium">{value || "—"}</div>
    </div>
  );
}

function CheckRow({
  ok,
  label,
  comment,
}: {
  ok: boolean;
  label: string;
  comment: string | null;
}) {
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
        {comment && (
          <p className="text-xs text-muted-foreground">{comment}</p>
        )}
      </div>
    </div>
  );
}
