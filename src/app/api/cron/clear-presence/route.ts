import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Apaga la presencia del inbox de todos los vendedores, una vez por noche.
 *
 * Es la contraparte de haber alargado la ventana de frescura a 8 horas. Esa
 * ventana existe para que irse a otra aplicación no te saque del reparto, pero
 * deja abierto el caso de quien se fue a su casa con el browser abierto y la
 * máquina suspendida: ahí el beacon de `pagehide` nunca se dispara y el
 * vendedor seguiría "activo" recibiendo conversaciones que nadie va a leer.
 *
 * Ninguna concesionaria tiene horario de atención configurado hoy, así que sin
 * esto no habría nada que corte la noche.
 *
 * Es deliberadamente tonto: apaga a todos. Un vendedor que de verdad esté
 * trabajando a esa hora se vuelve a activar con un click, y el costo de ese
 * click es mucho menor que el de una conversación asignada a alguien que
 * duerme.
 *
 * Autenticación: `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET no configurado" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ inbox_available: false, inbox_available_at: null })
    .eq("inbox_available", true)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, apagados: data?.length ?? 0 });
}
