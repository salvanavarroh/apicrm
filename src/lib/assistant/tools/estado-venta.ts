// ============================================================================
// estadoDeVenta — en qué paso está una venta y quién la tiene.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import type { AssistantContext } from "@/lib/assistant/context";
import { fullName } from "@/lib/leads";
import { type Tool, type ToolResult } from "@/lib/assistant/tools/types";

type SaleRow = {
  id: string;
  status: "evaluating" | "accepted" | "rejected";
  started_at: string;
  resolved_at: string | null;
  scoring_check: boolean | null;
  documentation_check: boolean | null;
  payment_check: boolean | null;
  rejection_reason: string | null;
  lead_id: string;
  leads: { first_name: string | null; last_name: string | null } | null;
};

const STATUS_LABEL: Record<SaleRow["status"], string> = {
  evaluating: "Evaluando",
  accepted: "Aprobada",
  rejected: "Rechazada",
};

const SALES_BASE_BY_ROLE: Record<string, string> = {
  admin: "/admin/sales",
  manager: "/manager/sales",
  supervisor: "/manager/sales",
  sales: "/sales/sales",
};

export const estadoDeVenta: Tool = {
  name: "estadoDeVenta",
  description: "Estado de las ventas visibles para el usuario y qué falta en cada una.",
  async run(_question: string, ctx: AssistantContext): Promise<ToolResult> {
    const supabase = await createClient();
    const base = SALES_BASE_BY_ROLE[ctx.role] ?? "/";

    const { data, error } = await supabase
      .from("sales")
      .select(
        "id, status, started_at, resolved_at, scoring_check, documentation_check, payment_check, rejection_reason, lead_id, leads(first_name, last_name)",
      )
      .order("started_at", { ascending: false })
      .limit(8);

    if (error) return { data: `No pude leer las ventas: ${error.message}`, direct: true };

    const rows = (data ?? []) as unknown as SaleRow[];
    if (rows.length === 0) {
      return {
        data: "No hay ventas registradas dentro de tu alcance.",
        links: [{ href: base, label: "Ver ventas" }],
      };
    }

    const lines = rows.map((s) => {
      const quien = fullName(s.leads?.first_name ?? null, s.leads?.last_name ?? null);
      const checks =
        s.status === "evaluating"
          ? ` · checks: scoring ${flag(s.scoring_check)}, documentación ${flag(s.documentation_check)}, pago ${flag(s.payment_check)}`
          : "";
      const motivo =
        s.status === "rejected" && s.rejection_reason
          ? ` · motivo: ${s.rejection_reason}`
          : "";
      return (
        `- ${quien || "Lead sin nombre"} · ${STATUS_LABEL[s.status]}` +
        ` · iniciada ${s.started_at.slice(0, 10)}` +
        checks +
        motivo +
        ` · ${base}/${s.id}`
      );
    });

    const pendientes = rows.filter((s) => s.status === "evaluating").length;

    return {
      data: [
        `Ventas visibles (${rows.length}, ${pendientes} esperando aprobación):`,
        ...lines,
      ].join("\n"),
      links: [{ href: base, label: "Ver ventas" }],
      note: `${rows.length} ventas`,
    };
  },
};

function flag(v: boolean | null): string {
  return v === true ? "OK" : "pendiente";
}
