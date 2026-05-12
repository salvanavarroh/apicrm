import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cron mensual de facturación (PRD §6.3).
 * Genera un subscription_payment por cada empresa con monthly_price definido.
 * Idempotente: si ya hay un payment para (company, period_year, period_month),
 * el upsert lo respeta sin duplicar.
 *
 * Sigue generando aunque la empresa esté suspendida (PRD §6.3).
 *
 * Autenticación: header `Authorization: Bearer <CRON_SECRET>`.
 * Vercel Cron lo agrega automáticamente cuando se define en vercel.json.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET no configurado" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: companies, error: cErr } = await supabase
    .from("companies")
    .select("id, monthly_price")
    .not("monthly_price", "is", null);

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const now = new Date();
  const periodYear = now.getUTCFullYear();
  const periodMonth = now.getUTCMonth() + 1;
  const dueDate = new Date(now);
  dueDate.setUTCDate(dueDate.getUTCDate() + 30);
  const dueDateStr = dueDate.toISOString().slice(0, 10);

  const rows = (companies ?? [])
    .filter((c) => c.monthly_price !== null)
    .map((c) => ({
      company_id: c.id,
      period_year: periodYear,
      period_month: periodMonth,
      amount: c.monthly_price as number,
      due_date: dueDateStr,
      status: "pending" as const,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ generated: 0, skipped: 0 });
  }

  // Upsert ignorando duplicados (unique constraint en company_id+period).
  const { error: upErr, count } = await supabase
    .from("subscription_payments")
    .upsert(rows, {
      onConflict: "company_id,period_year,period_month",
      ignoreDuplicates: true,
      count: "exact",
    });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    generated: count ?? 0,
    candidates: rows.length,
    period: `${periodYear}-${String(periodMonth).padStart(2, "0")}`,
  });
}
