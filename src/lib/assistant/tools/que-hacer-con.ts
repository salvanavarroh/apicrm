// ============================================================================
// queHacerCon — la próxima mejor acción sobre un lead.
//
// No inventa nada: reusa `nextBestAction`, que es la misma función pura que ya
// pinta la tarjeta de sugerencia en la ficha del lead. El asistente y la app
// dicen lo mismo porque es literalmente el mismo código.
//
// Toma el lead de la URL donde está parado el usuario. Esa es la razón por la
// que el widget manda el pathname: preguntar "¿qué hago con esto?" en una ficha
// tiene que significar algo.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import type { AssistantContext } from "@/lib/assistant/context";
import { fullName } from "@/lib/leads";
import { nextBestAction, type NbaInput } from "@/lib/next-best-action";
import {
  leadIdFromRoute,
  type Tool,
  type ToolResult,
} from "@/lib/assistant/tools/types";

export const queHacerCon: Tool = {
  name: "queHacerCon",
  description: "Sugiere la próxima acción sobre el lead que el usuario está mirando.",
  async run(_question: string, ctx: AssistantContext): Promise<ToolResult> {
    const leadId = leadIdFromRoute(ctx.route);
    if (!leadId) {
      return {
        data:
          "Para sugerirte la próxima acción necesito saber de qué lead hablás. " +
          "Abrí su ficha y volvé a preguntarme, o decime el nombre y lo busco.",
        direct: true,
      };
    }

    const supabase = await createClient();
    const [lead, tasks, visits, quotes, sale, interests] = await Promise.all([
      supabase
        .from("leads")
        .select(
          "id, first_name, last_name, status, temperature, created_at, status_changed_at, last_managed_at, last_contacted_at, assigned_user_id",
        )
        .eq("id", leadId)
        .maybeSingle(),
      supabase
        .from("lead_tasks")
        .select("title, due_date, completed_at")
        .eq("lead_id", leadId),
      supabase.from("visits").select("scheduled_at, status").eq("lead_id", leadId),
      supabase.from("quotes").select("created_at, sent_at").eq("lead_id", leadId),
      supabase
        .from("sales")
        .select("status")
        .eq("lead_id", leadId)
        .eq("status", "evaluating")
        .maybeSingle(),
      supabase
        .from("lead_interests")
        .select("day, month, kind")
        .eq("lead_id", leadId)
        .eq("kind", "cumpleanos"),
    ]);

    if (!lead.data) {
      return {
        data:
          "No encuentro ese lead dentro de lo que podés ver. " +
          "Puede estar asignado a otra persona o pertenecer a otra gerencia.",
        direct: true,
      };
    }

    const input: NbaInput = {
      lead: lead.data as NbaInput["lead"],
      tasks: (tasks.data ?? []) as NbaInput["tasks"],
      visits: (visits.data ?? []) as NbaInput["visits"],
      quotes: (quotes.data ?? []) as NbaInput["quotes"],
      birthdays: (interests.data ?? []) as NbaInput["birthdays"],
      activeSaleStatus: (sale.data as { status?: string } | null)?.status ?? null,
    };

    const nba = nextBestAction(input);
    const quien = fullName(
      (lead.data as { first_name: string | null }).first_name,
      (lead.data as { last_name: string | null }).last_name,
    );

    if (!nba) {
      return {
        data: `El lead ${quien} está en un estado que no requiere ninguna acción del vendedor ahora mismo.`,
        direct: true,
      };
    }

    return {
      data: [
        `Próxima acción sugerida para ${quien}:`,
        `- Qué hacer: ${nba.title}`,
        `- Por qué: ${nba.reason}`,
        `- Urgencia: ${nba.urgency}`,
      ].join("\n"),
      note: `nba ${nba.kind}/${nba.urgency}`,
    };
  },
};
