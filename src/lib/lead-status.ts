import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

// Transiciones automáticas de estado (#7). Solo avanzan dentro del pipeline
// pre-venta (new → contacted → interested → quoted); nunca retroceden ni pisan
// estados de venta (evaluating/accepted/rejected/closed) ni 'not_interested'.

export const PRESALE_RANK: Record<string, number> = {
  new: 0,
  contacted: 1,
  interested: 2,
  quoted: 3,
};

export type PresaleStatus = "contacted" | "interested" | "quoted";

export async function maybeAdvanceStatus(
  supabase: SupabaseClient<Database>,
  leadId: string,
  target: PresaleStatus,
): Promise<void> {
  const { data: lead } = await supabase
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;
  const curRank = PRESALE_RANK[lead.status];
  if (curRank === undefined) return; // venta o not_interested → no tocar
  if (PRESALE_RANK[target] > curRank) {
    await supabase.from("leads").update({ status: target }).eq("id", leadId);
  }
}
