"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import {
  STANDARD_TEMPLATES,
  languageForCountry,
  variantForCountry,
} from "@/lib/messaging/standard-templates";
import { createTemplate } from "@/lib/messaging/zernio";
import { createAdminClient } from "@/lib/supabase/admin";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; message: string };

// Placeholders de ejemplo para que Meta acepte el template.
const EXAMPLE = ["Juan", "Corolla XEI", "la concesionaria"];

function bodyComponent(text: string) {
  return {
    type: "BODY",
    text,
    example: { body_text: [EXAMPLE] },
  };
}

function countVars(text: string): number {
  const m = text.match(/\{\{\d+\}\}/g);
  return m ? new Set(m).size : 0;
}

async function channelOf(companyId: string, channelId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("messaging_channels")
    .select("id, company_id, zernio_account_id, platform")
    .eq("id", channelId)
    .maybeSingle();
  if (!data || data.company_id !== companyId || data.platform !== "whatsapp") return null;
  return data;
}

/** Crea una plantilla propia y la manda a aprobar a Meta. */
export async function createWhatsappTemplate(input: {
  channelId: string;
  name: string;
  category: "UTILITY" | "MARKETING";
  language: string;
  body: string;
}): Promise<Result> {
  const profile = await requireRole(["admin", "manager"]);
  const admin = createAdminClient();
  const channel = await channelOf(profile.company_id!, input.channelId);
  if (!channel) return { ok: false, message: "Canal de WhatsApp no encontrado" };

  const name = input.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!name || !/^[a-z]/.test(name)) {
    return { ok: false, message: "El nombre debe empezar con letra (a-z, 0-9, _)" };
  }
  if (!input.body.trim()) return { ok: false, message: "El cuerpo no puede estar vacío" };

  try {
    await createTemplate({
      accountId: channel.zernio_account_id,
      name,
      category: input.category,
      language: input.language,
      components: [bodyComponent(input.body)],
    });
    await admin.from("whatsapp_templates").upsert(
      {
        company_id: profile.company_id!,
        channel_id: channel.id,
        zernio_template_name: name,
        language: input.language,
        category: input.category,
        is_standard: false,
        body_preview: input.body,
        variables: buildVarList(input.body) as never,
        status: "PENDING",
      },
      { onConflict: "channel_id,zernio_template_name,language" },
    );
    revalidatePath("/admin/whatsapp-templates");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error creando plantilla" };
  }
}

function buildVarList(body: string) {
  const labels: Record<number, string> = { 1: "nombre", 2: "vehiculo", 3: "concesionaria" };
  const n = countVars(body);
  return Array.from({ length: n }, (_, i) => ({ pos: i + 1, maps_to: labels[i + 1] ?? `var${i + 1}` }));
}

/** Crea el set estándar (por idioma del país) en el WABA del canal. */
export async function seedStandardTemplates(channelId: string): Promise<Result<{ created: number }>> {
  const profile = await requireRole(["admin", "manager"]);
  const admin = createAdminClient();
  const channel = await channelOf(profile.company_id!, channelId);
  if (!channel) return { ok: false, message: "Canal de WhatsApp no encontrado" };

  const { data: company } = await admin
    .from("companies")
    .select("country")
    .eq("id", profile.company_id!)
    .maybeSingle();
  const variant = variantForCountry(company?.country);
  const language = languageForCountry(company?.country);

  let created = 0;
  const errors: string[] = [];
  for (const t of STANDARD_TEMPLATES) {
    const body = t.bodies[variant];
    try {
      await createTemplate({
        accountId: channel.zernio_account_id,
        name: t.name,
        category: t.category,
        language,
        components: [bodyComponent(body)],
      });
      await admin.from("whatsapp_templates").upsert(
        {
          company_id: profile.company_id!,
          channel_id: channel.id,
          zernio_template_name: t.name,
          language,
          category: t.category,
          is_standard: true,
          body_preview: body,
          variables: buildVarList(body) as never,
          status: "PENDING",
        },
        { onConflict: "channel_id,zernio_template_name,language" },
      );
      created++;
    } catch (e) {
      errors.push(`${t.name}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  revalidatePath("/admin/whatsapp-templates");
  if (created === 0 && errors.length) {
    return { ok: false, message: errors[0] };
  }
  return { ok: true, created };
}
