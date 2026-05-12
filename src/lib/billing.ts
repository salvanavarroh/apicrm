import { createClient } from "@/lib/supabase/server";

/**
 * Banner de morosidad (PRD §6.3): visible para todos los roles a partir del
 * día +15 desde el due_date. Admin ve detalle, otros roles ven mensaje
 * genérico. Devuelve null si no hay morosidad relevante.
 */
export async function getOverdueInfo(
  companyId: string | null,
  graceDays = 15,
): Promise<{
  amount: number;
  dueDate: string;
  daysOverdue: number;
} | null> {
  if (!companyId) return null;

  const supabase = await createClient();

  const { data } = await supabase
    .from("subscription_payments")
    .select("amount, due_date")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("due_date", { ascending: true })
    .limit(1);

  const oldest = data?.[0];
  if (!oldest) return null;

  const dueDate = new Date(oldest.due_date);
  const today = new Date();
  const days = Math.floor(
    (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (days < graceDays) return null;

  return {
    amount: Number(oldest.amount),
    dueDate: oldest.due_date,
    daysOverdue: days,
  };
}
