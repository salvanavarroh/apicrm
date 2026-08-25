// ============================================================================
// miEquipo — quién está en el equipo y cómo está repartida la carga.
//
// Usa la RPC `active_lead_counts`, que es la misma que alimenta la pantalla de
// reasignación: si acá diera otro número que ahí, el asistente estaría mintiendo
// respecto de la propia app.
// ============================================================================

import { actingManagerId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AssistantContext } from "@/lib/assistant/context";
import { fullName } from "@/lib/leads";
import { VENDOR_MAX_CAPACITY } from "@/lib/team";
import { type Tool, type ToolResult } from "@/lib/assistant/tools/types";

type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  inbox_available: boolean;
};

export const miEquipo: Tool = {
  name: "miEquipo",
  description: "Integrantes del equipo y cuántos leads activos tiene cada uno.",
  async run(_question: string, ctx: AssistantContext): Promise<ToolResult> {
    if (ctx.role === "sales" || ctx.role === "data_provider") {
      return {
        data:
          "Con tu rol no ves el equipo completo. " +
          (ctx.managerName
            ? `Tu gerente es ${ctx.managerName}.`
            : "No tenés un gerente asignado en tu ficha."),
        direct: true,
      };
    }

    const supabase = await createClient();

    // El admin ve todos los vendedores de la concesionaria; el gerente y el
    // supervisor, los de su equipo. La RLS de `profiles` ya acota, pero el
    // filtro por `manager_id` es lo que hace que el gerente vea SU equipo y no
    // el de al lado.
    let query = supabase
      .from("profiles")
      .select("id, first_name, last_name, role, status, inbox_available")
      .in("role", ["sales", "supervisor"])
      .eq("status", "active");

    if (ctx.role === "manager" || ctx.role === "supervisor") {
      query = query.eq("manager_id", actingManagerId(ctx.profile));
    }

    const { data, error } = await query.limit(50);
    if (error) return { data: `No pude leer el equipo: ${error.message}`, direct: true };

    const members = (data ?? []) as MemberRow[];
    if (members.length === 0) {
      return {
        data: "No hay vendedores activos en tu equipo todavía.",
        links: [{ href: "/manager/team", label: "Invitar un vendedor" }],
      };
    }

    const { data: counts } = await supabase.rpc("active_lead_counts", {
      p_user_ids: members.map((m) => m.id),
    });
    const byUser = new Map(
      ((counts ?? []) as { user_id: string; cnt: number }[]).map((c) => [
        c.user_id,
        c.cnt,
      ]),
    );

    const lines = members
      .map((m) => ({ m, cnt: byUser.get(m.id) ?? 0 }))
      .sort((a, b) => b.cnt - a.cnt)
      .map(
        ({ m, cnt }) =>
          `- ${fullName(m.first_name, m.last_name)} (${m.role === "supervisor" ? "supervisor" : "vendedor"})` +
          ` · ${cnt} leads activos${cnt >= VENDOR_MAX_CAPACITY ? " · al tope de capacidad" : ""}` +
          ` · inbox: ${m.inbox_available ? "activo" : "no disponible"}`,
      );

    const total = [...byUser.values()].reduce((a, b) => a + b, 0);

    return {
      data: [
        `Equipo (${members.length} personas, ${total} leads activos en total).`,
        `La capacidad de referencia por vendedor es ${VENDOR_MAX_CAPACITY} leads; es informativa, no corta la asignación automática.`,
        ...lines,
      ].join("\n"),
      links: [
        {
          href: ctx.role === "admin" ? "/admin/users" : "/manager/team",
          label: "Ver el equipo",
        },
      ],
      note: `${members.length} integrantes`,
    };
  },
};
