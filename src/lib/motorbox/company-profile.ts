import { companyCountry } from "@/lib/lead-reentry";
import { getNumberInfo } from "@/lib/messaging/zernio";
import { normalizeChannelPhone } from "@/lib/motorbox/channel-phone";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================================
// El perfil de una concesionaria, tal como lo consume Motorbox.
//
// Contrato: docs/motorbox-spec-motorbox.md §6. NO devolver nada que no esté en
// ese contrato — leads, vendedores y ventas no tienen por qué salir de acá.
// ============================================================================

type Admin = ReturnType<typeof createAdminClient>;

export type MotorboxCompanyProfile = {
  company: {
    id: string;
    name: string;
    legal_name: string | null;
    cuit: string | null;
    country: string | null;
    address: string | null;
    phone: string | null;
    logo_url: string | null;
    status: string;
    plan: string | null;
  };
  branches: Array<{
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    status: string;
  }>;
  whatsapp: Array<{
    channel_id: string;
    display_name: string | null;
    phone_e164: string | null;
    branch_id: string | null;
    status: string;
  }>;
  admins: Array<{
    id: string;
    name: string;
    email: string | null;
    role: string;
  }>;
};

/**
 * Completa `phone_e164` de los canales de WhatsApp que todavía no lo tengan,
 * pidiéndoselo a Zernio en vivo y persistiéndolo.
 *
 * Pasa en canales recién conectados a los que nadie les corrió el health check.
 * Es best-effort: si Zernio falla, el canal sale con `phone_e164: null` y
 * Motorbox lo maneja (su onboarding contempla no tener número). Romper la
 * respuesta entera por esto sería peor.
 */
async function backfillMissingPhones(
  admin: Admin,
  channels: Array<{ id: string; zernio_account_id: string; phone_e164: string | null }>,
  country: string | null,
): Promise<Map<string, string | null>> {
  const resolved = new Map<string, string | null>();
  const pending = channels.filter((c) => !c.phone_e164);

  await Promise.all(
    pending.map(async (c) => {
      try {
        const info = await getNumberInfo(c.zernio_account_id);
        const phone = normalizeChannelPhone(info.display_phone_number ?? null, country);
        if (phone) {
          await admin
            .from("messaging_channels")
            .update({ phone_e164: phone })
            .eq("id", c.id);
        }
        resolved.set(c.id, phone);
      } catch {
        resolved.set(c.id, null);
      }
    }),
  );

  return resolved;
}

export async function loadCompanyProfile(
  companyId: string,
): Promise<MotorboxCompanyProfile | null> {
  const admin = createAdminClient();

  const { data: company } = await admin
    .from("companies")
    .select(
      "id, name, legal_name, cuit, country, address, phone, logo_url, status, plan",
    )
    .eq("id", companyId)
    .maybeSingle();

  if (!company) return null;

  const [{ data: branches }, { data: channels }, { data: profiles }] =
    await Promise.all([
      admin
        .from("branches")
        .select("id, name, address, phone, status")
        .eq("company_id", companyId)
        .eq("status", "active")
        .order("name"),
      admin
        .from("messaging_channels")
        .select("id, display_name, phone_e164, branch_id, status, zernio_account_id")
        .eq("company_id", companyId)
        .eq("platform", "whatsapp")
        .eq("status", "active"),
      admin
        .from("profiles")
        .select("id, first_name, last_name, role")
        .eq("company_id", companyId)
        .in("role", ["admin", "group_admin"])
        .eq("status", "active"),
    ]);

  const waChannels = channels ?? [];
  const backfilled = await backfillMissingPhones(
    admin,
    waChannels,
    await companyCountry(admin, companyId),
  );

  // Los emails viven en auth.users, no en profiles.
  const emailById = new Map<string, string | null>();
  if ((profiles ?? []).length > 0) {
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users?.users ?? []) {
      if (u.id && u.email) emailById.set(u.id, u.email);
    }
  }

  return {
    company: {
      id: company.id,
      name: company.name,
      legal_name: company.legal_name,
      cuit: company.cuit,
      country: company.country,
      address: company.address,
      phone: company.phone,
      logo_url: company.logo_url,
      status: company.status,
      plan: company.plan,
    },
    branches: (branches ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      phone: b.phone,
      status: b.status,
    })),
    whatsapp: waChannels.map((c) => ({
      channel_id: c.id,
      display_name: c.display_name,
      phone_e164: c.phone_e164 ?? backfilled.get(c.id) ?? null,
      branch_id: c.branch_id,
      status: c.status,
    })),
    admins: (profiles ?? []).map((p) => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim(),
      email: emailById.get(p.id) ?? null,
      role: p.role,
    })),
  };
}
