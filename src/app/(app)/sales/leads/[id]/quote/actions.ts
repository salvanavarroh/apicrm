"use server";

import { renderToBuffer } from "@react-pdf/renderer";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import {
  QUOTE_MODALITY_LABEL,
  QuotePdf,
  type QuoteData,
} from "@/lib/quote-pdf";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const baseSchema = z.object({
  lead_id: z.string().uuid(),

  modality: z.enum(["cash", "financed", "savings_plan"]),

  client_first_name: z.string().optional().or(z.literal("")),
  client_last_name: z.string().optional().or(z.literal("")),
  client_email: z.string().email().optional().or(z.literal("")),
  client_phone: z.string().optional().or(z.literal("")),
  client_dni: z.string().optional().or(z.literal("")),

  vehicle_brand: z.string().optional().or(z.literal("")),
  vehicle_model: z.string().optional().or(z.literal("")),
  vehicle_version: z.string().optional().or(z.literal("")),
  vehicle_year: z.string().optional().or(z.literal("")),
  vehicle_color: z.string().optional().or(z.literal("")),

  base_price: z.coerce.number().nonnegative(),
  discount: z.coerce.number().nonnegative().default(0),
  used_car_value: z.coerce.number().nonnegative().default(0),

  modality_data: z.record(z.string(), z.union([z.string(), z.number()])).default({}),

  valid_until: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export type QuoteInput = z.input<typeof baseSchema>;

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; message: string };

/**
 * Calcula los 3 montos clave de una cotización:
 *
 *   subtotal       = valor del vehículo (base − descuento − usado)
 *   totalToPay     = lo que efectivamente paga el cliente
 *   totalInterest  = solo intereses (financed) o cuotas administrativas
 *                    (savings_plan) — la "diferencia" sobre el subtotal
 *
 * Cash:
 *   totalToPay = subtotal
 *   totalInterest = 0
 *
 * Financed (amortización francesa):
 *   monthly = financedAmount * r * (1+r)^n / ((1+r)^n − 1)
 *   totalToPay = monthly * installments + downPayment
 *   totalInterest = monthly * installments − financedAmount
 *
 * Savings plan:
 *   totalToPay = cuotaActual * cuotasTotales + cuotaInicial + adminFees
 *   totalInterest = totalToPay − subtotal
 */
function computeTotals(input: {
  modality: "cash" | "financed" | "savings_plan";
  base_price: number;
  discount: number;
  used_car_value: number;
  modality_data: Record<string, string | number>;
}): { subtotal: number; totalToPay: number; totalInterest: number } {
  const subtotal = Math.max(
    0,
    input.base_price - input.discount - input.used_car_value,
  );

  const md = input.modality_data;
  const num = (k: string) => {
    const v = md[k];
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      // Acepta "75" y "75,5" y "75.5"
      const n = Number(v.replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };

  if (input.modality === "cash") {
    return { subtotal, totalToPay: subtotal, totalInterest: 0 };
  }

  if (input.modality === "financed") {
    const downPayment = num("down_payment");
    const financedAmount =
      num("financed_amount") || Math.max(0, subtotal - downPayment);
    const installments = num("installments");
    const tnaPct = num("tna");
    let monthly = num("installment_value");

    if (installments > 0 && financedAmount > 0) {
      if (tnaPct > 0) {
        const r = tnaPct / 100 / 12;
        const f = Math.pow(1 + r, installments);
        monthly = (financedAmount * r * f) / (f - 1);
      } else if (!monthly) {
        monthly = financedAmount / installments;
      }
    }

    const totalToPay = monthly * installments + downPayment;
    const totalInterest = Math.max(0, monthly * installments - financedAmount);
    return { subtotal, totalToPay, totalInterest };
  }

  // savings_plan
  const totalInstallments = num("total_installments");
  const initialInstallment = num("initial_installment");
  const currentInstallment = num("current_installment_value");
  const adminFees = num("administrative_fees");
  const totalToPay =
    currentInstallment * totalInstallments + initialInstallment + adminFees;
  const totalInterest = Math.max(0, totalToPay - subtotal);
  return { subtotal, totalToPay, totalInterest };
}

async function buildPdfBuffer(opts: {
  companyId: string;
  leadId: string;
  vendorId: string;
  data: QuoteData;
  number: string;
}) {
  const admin = createAdminClient();
  const [{ data: company }, { data: vendor }] = await Promise.all([
    admin
      .from("companies")
      .select("name, legal_name, cuit, address, phone, logo_url")
      .eq("id", opts.companyId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", opts.vendorId)
      .maybeSingle(),
  ]);

  if (!company) throw new Error("Empresa no encontrada");

  const pdfBuffer = await renderToBuffer(
    QuotePdf({
      company,
      vendor: vendor ?? { first_name: null, last_name: null },
      data: opts.data,
      number: opts.number,
      createdAt: new Date().toISOString(),
    }),
  );
  return pdfBuffer;
}

// Vista previa: devuelve el PDF como dataURL (base64) sin persistir.
export async function previewQuote(
  raw: QuoteInput,
): Promise<Result<{ dataUrl: string }>> {
  const profile = await requireRole(["sales"]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };

  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }
  const { subtotal, totalToPay, totalInterest } = computeTotals(parsed.data);
  const data: QuoteData = {
    modality: parsed.data.modality,
    client: {
      first_name: parsed.data.client_first_name || null,
      last_name: parsed.data.client_last_name || null,
      email: parsed.data.client_email || null,
      phone: parsed.data.client_phone || null,
      dni: parsed.data.client_dni || null,
    },
    vehicle: {
      brand: parsed.data.vehicle_brand || null,
      model: parsed.data.vehicle_model || null,
      version: parsed.data.vehicle_version || null,
      year: parsed.data.vehicle_year || null,
      color: parsed.data.vehicle_color || null,
    },
    base_price: parsed.data.base_price,
    discount: parsed.data.discount,
    used_car_value: parsed.data.used_car_value,
    total: subtotal,
    total_to_pay: totalToPay,
    total_interest: totalInterest,
    modality_data: parsed.data.modality_data,
    valid_until: parsed.data.valid_until || null,
    notes: parsed.data.notes || null,
  };

  const pdf = await buildPdfBuffer({
    companyId: profile.company_id,
    leadId: parsed.data.lead_id,
    vendorId: profile.id,
    data,
    number: "PREVIEW",
  });
  const dataUrl = `data:application/pdf;base64,${pdf.toString("base64")}`;
  return { ok: true, dataUrl };
}

// Persistir cotización: inserta en quotes, sube PDF a Storage, marca el lead
// como 'quoted'.
export async function createQuote(
  raw: QuoteInput,
): Promise<Result<{ quoteId: string; pdfUrl: string }>> {
  const profile = await requireRole(["sales"]);
  if (!profile.company_id) return { ok: false, message: "Sin empresa" };

  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }
  const { subtotal, totalToPay, totalInterest } = computeTotals(parsed.data);

  const admin = createAdminClient();

  const { data: quote, error: insertErr } = await admin
    .from("quotes")
    .insert({
      company_id: profile.company_id,
      lead_id: parsed.data.lead_id,
      vendor_id: profile.id,
      modality: parsed.data.modality,
      client_first_name: parsed.data.client_first_name || null,
      client_last_name: parsed.data.client_last_name || null,
      client_email: parsed.data.client_email || null,
      client_phone: parsed.data.client_phone || null,
      client_dni: parsed.data.client_dni || null,
      vehicle_brand: parsed.data.vehicle_brand || null,
      vehicle_model: parsed.data.vehicle_model || null,
      vehicle_version: parsed.data.vehicle_version || null,
      vehicle_year: parsed.data.vehicle_year || null,
      vehicle_color: parsed.data.vehicle_color || null,
      base_price: parsed.data.base_price,
      discount: parsed.data.discount,
      used_car_value: parsed.data.used_car_value,
      total: subtotal,
      total_to_pay: totalToPay,
      total_interest: totalInterest,
      modality_data: parsed.data.modality_data,
      valid_until: parsed.data.valid_until || null,
      notes: parsed.data.notes || null,
    })
    .select("id, created_at")
    .single();

  if (insertErr || !quote) {
    return { ok: false, message: insertErr?.message ?? "Error creando" };
  }

  const data: QuoteData = {
    modality: parsed.data.modality,
    client: {
      first_name: parsed.data.client_first_name || null,
      last_name: parsed.data.client_last_name || null,
      email: parsed.data.client_email || null,
      phone: parsed.data.client_phone || null,
      dni: parsed.data.client_dni || null,
    },
    vehicle: {
      brand: parsed.data.vehicle_brand || null,
      model: parsed.data.vehicle_model || null,
      version: parsed.data.vehicle_version || null,
      year: parsed.data.vehicle_year || null,
      color: parsed.data.vehicle_color || null,
    },
    base_price: parsed.data.base_price,
    discount: parsed.data.discount,
    used_car_value: parsed.data.used_car_value,
    total: subtotal,
    total_to_pay: totalToPay,
    total_interest: totalInterest,
    modality_data: parsed.data.modality_data,
    valid_until: parsed.data.valid_until || null,
    notes: parsed.data.notes || null,
  };

  const pdfBuffer = await buildPdfBuffer({
    companyId: profile.company_id,
    leadId: parsed.data.lead_id,
    vendorId: profile.id,
    data,
    number: quote.id.slice(0, 8),
  });

  const pdfPath = `${profile.company_id}/${quote.id}.pdf`;
  const { error: uploadErr } = await admin.storage
    .from("quotes")
    .upload(pdfPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadErr) {
    return { ok: false, message: `PDF: ${uploadErr.message}` };
  }

  // Signed URL para descarga (24h).
  const { data: signed } = await admin.storage
    .from("quotes")
    .createSignedUrl(pdfPath, 60 * 60 * 24);

  await admin
    .from("quotes")
    .update({ pdf_path: pdfPath, pdf_url: signed?.signedUrl ?? null })
    .eq("id", quote.id);

  // Marcar lead como 'quoted' si no lo estaba.
  await admin
    .from("leads")
    .update({ status: "quoted" })
    .eq("id", parsed.data.lead_id)
    .neq("status", "quoted");

  revalidatePath(`/sales/leads/${parsed.data.lead_id}`);
  revalidatePath(`/sales/leads`);

  return {
    ok: true,
    quoteId: quote.id,
    pdfUrl: signed?.signedUrl ?? "",
  };
}

// Generar URL firmada nueva para una cotización existente (válida 24h).
export async function refreshQuotePdfUrl(
  quoteId: string,
): Promise<Result<{ url: string }>> {
  await requireRole(["sales", "admin", "manager"]);
  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("pdf_path")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote?.pdf_path) {
    return { ok: false, message: "No hay PDF para esta cotización" };
  }
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("quotes")
    .createSignedUrl(quote.pdf_path, 60 * 60 * 24);
  if (error || !data) return { ok: false, message: error?.message ?? "Error" };
  await admin
    .from("quotes")
    .update({ pdf_url: data.signedUrl })
    .eq("id", quoteId);
  return { ok: true, url: data.signedUrl };
}

// Enviar por email vía Resend. El PDF se envía como link (signed URL).
const sendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(1),
});

export async function sendQuoteByEmail(
  quoteId: string,
  raw: { to: string; subject: string; message: string },
): Promise<Result<{ messageId: string }>> {
  const profile = await requireRole(["sales"]);
  const parsed = sendSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      message:
        "Resend no configurado. Pediles a los admins activar RESEND_API_KEY.",
    };
  }

  const admin = createAdminClient();
  const { data: quote } = await admin
    .from("quotes")
    .select("id, pdf_path, modality, lead_id, company:companies!company_id(name)")
    .eq("id", quoteId)
    .eq("vendor_id", profile.id)
    .maybeSingle();
  if (!quote) {
    return { ok: false, message: "Cotización no encontrada" };
  }

  const { data: signed } = await admin.storage
    .from("quotes")
    .createSignedUrl(quote.pdf_path ?? "", 60 * 60 * 24 * 7);
  const pdfUrl = signed?.signedUrl;

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: `${quote.company?.name ?? "Presupuesto"} <onboarding@resend.dev>`,
    to: parsed.data.to,
    subject: parsed.data.subject,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 560px;">
        <p>Hola!</p>
        <p>${parsed.data.message.replace(/\n/g, "<br/>")}</p>
        ${pdfUrl ? `<p><a href="${pdfUrl}" style="background:#FF5906;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Ver presupuesto (${QUOTE_MODALITY_LABEL[quote.modality]})</a></p>` : ""}
        <p style="color:#888;font-size:12px;">El link es válido por 7 días.</p>
      </div>
    `,
  });
  if (error) return { ok: false, message: error.message };

  await admin
    .from("quotes")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", quoteId);

  revalidatePath(`/sales/leads/${quote.lead_id}`);
  return { ok: true, messageId: data?.id ?? "" };
}
