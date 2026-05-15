import { ChevronLeft, Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { QUOTE_MODALITY_LABEL } from "@/lib/quote-pdf";
import { createAdminClient } from "@/lib/supabase/admin";

import { QuoteSendActions } from "./send-actions";

export default async function QuoteViewPage({
  params,
}: {
  params: Promise<{ id: string; quoteId: string }>;
}) {
  const { id, quoteId } = await params;
  const profile = await requireRole(["sales", "admin", "manager"]);
  const admin = createAdminClient();

  const { data: quote } = await admin
    .from("quotes")
    .select(
      `
        *,
        company:companies!company_id (name, phone)
      `,
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (!quote) notFound();

  // URL firmada fresca para descarga
  let signedUrl: string | null = null;
  if (quote.pdf_path) {
    const { data: signed } = await admin.storage
      .from("quotes")
      .createSignedUrl(quote.pdf_path, 60 * 60);
    signedUrl = signed?.signedUrl ?? null;
  }

  const backHref =
    profile.role === "admin"
      ? `/admin/leads/${id}`
      : profile.role === "manager"
        ? `/manager/leads/${id}`
        : `/sales/leads/${id}`;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Volver al lead
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Presupuesto #{quote.id.slice(0, 8)}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge>{QUOTE_MODALITY_LABEL[quote.modality]}</Badge>
            <span>
              Creado el {new Date(quote.created_at).toLocaleDateString("es-AR")}
            </span>
            {quote.sent_at && (
              <>
                <span>·</span>
                <span>
                  Enviado el{" "}
                  {new Date(quote.sent_at).toLocaleDateString("es-AR")}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {signedUrl && (
            <Button variant="outline" asChild>
              <a href={signedUrl} target="_blank" rel="noreferrer">
                <Download className="mr-2 size-4" /> Descargar PDF
              </a>
            </Button>
          )}
          {profile.role === "sales" && profile.id === quote.vendor_id && (
            <QuoteSendActions
              quoteId={quote.id}
              clientEmail={quote.client_email}
              clientPhone={quote.client_phone}
              pdfUrl={signedUrl}
              companyName={quote.company?.name ?? ""}
            />
          )}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Vista del PDF</CardTitle>
        </CardHeader>
        <CardContent>
          {signedUrl ? (
            <iframe
              src={signedUrl}
              className="h-[80vh] w-full rounded-md border"
              title="Presupuesto"
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No hay PDF disponible para esta cotización.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumen aritmético</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat label="Precio base" value={quote.base_price} />
          <Stat label="Descuento" value={quote.discount} />
          <Stat label="Auto usado" value={quote.used_car_value} />
          <Stat label="Total" value={quote.total} highlight />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 font-mono ${
          highlight ? "text-xl font-semibold text-accent" : "text-base"
        }`}
      >
        {Number(value).toLocaleString("es-AR", {
          style: "currency",
          currency: "ARS",
          minimumFractionDigits: 0,
        })}
      </p>
    </div>
  );
}
