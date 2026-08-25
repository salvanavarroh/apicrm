// ============================================================================
// misNumeros — los KPIs del que pregunta, según su rol.
//
// Consultas ESTRECHAS con `count: exact, head: true`, no los loaders de
// `lib/reports`. Es una desviación consciente del plan: los loaders traen hasta
// 5.000 filas para armar un reporte completo y se comerían el presupuesto de
// 50–200 ms por herramienta. Cuando el usuario quiere el panorama entero, la
// respuesta correcta no es un párrafo: es el link al reporte, y eso es lo que
// devuelve `links`.
//
// El alcance no está en el código: lo pone la RLS. El mismo `count(*)` devuelve
// los leads del vendedor, los de la gerencia del gerente y los de toda la
// concesionaria para el admin, sin una sola condición acá.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import type { AssistantContext } from "@/lib/assistant/context";
import {
  monthStartIso,
  todayIso,
  type Tool,
  type ToolLink,
  type ToolResult,
} from "@/lib/assistant/tools/types";

const ACTIVE_STATUSES = ["new", "contacted", "interested", "quoted"] as const;

export const misNumeros: Tool = {
  name: "misNumeros",
  description: "KPIs del usuario según su rol: leads, tareas y ventas.",
  async run(_question: string, ctx: AssistantContext): Promise<ToolResult> {
    if (ctx.role === "super_admin") {
      return {
        data: "El super_admin no tiene números propios de una concesionaria.",
        direct: true,
        links: [{ href: "/super-admin/reports", label: "Reportes de la plataforma" }],
      };
    }

    const supabase = await createClient();
    const monthStart = monthStartIso();
    const today = todayIso();

    const [
      activos,
      nuevos,
      sinAsignar,
      sinContactar,
      leadsDelMes,
      tareasVencidas,
      tareasHoy,
      ventasAprobadas,
      ventasEvaluando,
    ] = await Promise.all([
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("status", [...ACTIVE_STATUSES])
        .is("archived_at", null),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "new")
        .is("archived_at", null),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .is("assigned_user_id", null)
        .is("archived_at", null),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .is("last_contacted_at", null)
        .in("status", [...ACTIVE_STATUSES])
        .is("archived_at", null),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart),
      supabase
        .from("lead_tasks")
        .select("id", { count: "exact", head: true })
        .is("completed_at", null)
        .lt("due_date", today),
      supabase
        .from("lead_tasks")
        .select("id", { count: "exact", head: true })
        .is("completed_at", null)
        .eq("due_date", today),
      supabase
        .from("sales")
        .select("id", { count: "exact", head: true })
        .eq("status", "accepted")
        .gte("resolved_at", monthStart),
      supabase
        .from("sales")
        .select("id", { count: "exact", head: true })
        .eq("status", "evaluating"),
    ]);

    const n = (r: { count: number | null }) => r.count ?? 0;

    const lines: string[] = [
      `Leads activos (Nuevo, Contactado, Interesado, Presupuestado): ${n(activos)}`,
      `Leads en estado Nuevo: ${n(nuevos)}`,
      `Leads activos que todavía no se contactaron nunca: ${n(sinContactar)}`,
      `Leads que entraron este mes: ${n(leadsDelMes)}`,
      `Tareas pendientes vencidas: ${n(tareasVencidas)}`,
      `Tareas para hoy: ${n(tareasHoy)}`,
      `Ventas aprobadas este mes: ${n(ventasAprobadas)}`,
      `Ventas esperando aprobación: ${n(ventasEvaluando)}`,
    ];

    // "Sin asignar" sólo tiene sentido para quien puede asignar.
    if (ctx.role === "admin" || ctx.role === "manager" || ctx.role === "supervisor") {
      lines.splice(3, 0, `Leads sin vendedor asignado: ${n(sinAsignar)}`);
    }

    const links: ToolLink[] = [];
    if (ctx.role === "admin") {
      links.push({ href: "/admin/reportes", label: "Ver los reportes completos" });
    } else if (ctx.role === "manager" || ctx.role === "supervisor") {
      links.push({ href: "/manager/reportes", label: "Ver los reportes completos" });
    } else if (ctx.role === "sales") {
      links.push({ href: "/sales", label: "Ver mi inicio" });
    }

    return {
      data: [
        `Números al día de hoy, con el alcance de ${ctx.displayName} (${ctx.role}):`,
        ...lines,
      ].join("\n"),
      links,
      note: "9 counts con RLS del usuario",
    };
  },
};
