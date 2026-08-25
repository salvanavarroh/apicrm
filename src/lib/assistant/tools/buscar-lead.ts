// ============================================================================
// buscarLead — encontrar un lead y darle el link directo.
//
// Si la RLS no deja ver ese lead, no aparece. El asistente NO dice "existe pero
// no lo podés ver": dice que no lo encuentra en su alcance y explica cuál es.
// La diferencia importa: filtrar la existencia de un registro también es
// filtrar información.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import type { AssistantContext } from "@/lib/assistant/context";
import { fullName, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/leads";
import { scopeOf } from "@/lib/permissions";
import {
  searchTermOf,
  type Tool,
  type ToolLink,
  type ToolResult,
} from "@/lib/assistant/tools/types";

type LeadRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  last_contacted_at: string | null;
  assigned_user_id: string | null;
};

const LEAD_BASE_BY_ROLE: Record<string, string> = {
  admin: "/admin/leads",
  manager: "/manager/leads",
  supervisor: "/manager/leads",
  sales: "/sales/leads",
  data_provider: "/data-provider/leads",
  super_admin: "/super-admin/leads",
};

export const buscarLead: Tool = {
  name: "buscarLead",
  description: "Busca un lead por nombre, teléfono o mail dentro del alcance del usuario.",
  async run(question: string, ctx: AssistantContext): Promise<ToolResult> {
    const term = searchTermOf(question);
    if (term.length < 3) {
      return {
        data: "Para buscar un lead necesito un nombre, un teléfono o un mail.",
        direct: true,
      };
    }

    const supabase = await createClient();
    // `%` y `,` rompen el filtro `.or()` de PostgREST: se escapan antes.
    const safe = term.replace(/[%,()]/g, " ").trim();

    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, first_name, last_name, phone, email, status, vehicle_brand, vehicle_model, last_contacted_at, assigned_user_id",
      )
      .or(
        [
          `first_name.ilike.%${safe}%`,
          `last_name.ilike.%${safe}%`,
          `phone.ilike.%${safe}%`,
          `email.ilike.%${safe}%`,
        ].join(","),
      )
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      return { data: `No pude buscar: ${error.message}`, direct: true };
    }

    const rows = (data ?? []) as LeadRow[];
    const base = LEAD_BASE_BY_ROLE[ctx.role] ?? "/";

    if (rows.length === 0) {
      const alcance = scopeOf(ctx.profile, "leads:view");
      return {
        data:
          `No encontré ningún lead que coincida con "${safe}" dentro de lo que podés ver` +
          (alcance ? ` (${alcance})` : "") +
          ".",
        direct: true,
        links: [{ href: base, label: "Ver todos mis leads" }],
      };
    }

    const links: ToolLink[] = rows.slice(0, 3).map((l) => ({
      href: `${base}/${l.id}`,
      label: fullName(l.first_name, l.last_name) || "Lead sin nombre",
    }));

    const lines = rows.map((l) => {
      const auto = [l.vehicle_brand, l.vehicle_model].filter(Boolean).join(" ");
      return (
        `- ${fullName(l.first_name, l.last_name) || "Sin nombre"}` +
        ` · ${LEAD_STATUS_LABELS[l.status]}` +
        (auto ? ` · ${auto}` : "") +
        (l.phone ? ` · tel ${l.phone}` : "") +
        (l.last_contacted_at
          ? ` · último contacto ${l.last_contacted_at.slice(0, 10)}`
          : " · nunca contactado") +
        ` · ficha: ${base}/${l.id}`
      );
    });

    return {
      data: [`Leads que coinciden con "${safe}" (${rows.length}):`, ...lines].join("\n"),
      links,
      note: `${rows.length} resultados`,
    };
  },
};
