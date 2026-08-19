"use server";

import { requireProfile } from "@/lib/auth";
import { loadGroupSpend, type BrandSpend } from "@/lib/group-report";

/**
 * Inversión de ads por marca, a pedido.
 *
 * Va aparte del consolidado porque pega contra Zernio: son varias llamadas HTTP
 * por marca y un grupo de 10 marcas tardaría diez veces lo que tarda una. La
 * pantalla carga rápido con lo de la base y esto se pide con un botón.
 */
export async function getGroupSpend(range: {
  from: string;
  to: string;
}): Promise<{ ok: true; rows: BrandSpend[] } | { ok: false; message: string }> {
  const profile = await requireProfile();
  if (profile.role !== "group_admin" || !profile.group_id) {
    return { ok: false, message: "Sólo el admin del grupo" };
  }
  try {
    // El groupId sale del profile, no del cliente: no hay forma de pedir el
    // consolidado de otro grupo.
    const rows = await loadGroupSpend(profile.group_id, range);
    return { ok: true, rows };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo traer la inversión",
    };
  }
}
