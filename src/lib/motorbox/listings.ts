import { getServerEnv } from "@/lib/env";
import { publicOrigin } from "@/lib/motorbox/config";

// Cliente del endpoint de publicaciones de Motorbox.
// Contrato: docs/motorbox-spec-motorbox.md §10.4.

export type MotorboxListing = {
  public_code: string;
  url: string;
  status: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  year: number | null;
  km: number | null;
  price: number | null;
  /** "ARS" | "USD". Motorbox NO convierte: guardamos la moneda que mandan. */
  currency: string | null;
  condition: string | null;
  photo_url: string | null;
  /**
   * El `company_id` de API (uuid). OJO: no es el id de concesionaria de
   * Motorbox — ellos tienen los dos. Si acá llega el de ellos, el chequeo de
   * pertenencia falla siempre y TODOS los leads de Motorbox pierden la
   * atribución sin un solo error en los logs.
   */
  api_crm_company_id: string | null;
  api_crm_branch_id: string | null;
};

const TIMEOUT_MS = 4_000;

/**
 * Trae los datos de una publicación por su código público.
 *
 * Best-effort con un solo reintento: si Motorbox no contesta, el lead se crea
 * igual como un WhatsApp normal. Preferimos un lead sin atribución a no tener
 * el lead.
 */
export async function fetchListing(
  code: string,
): Promise<MotorboxListing | null> {
  const origin = publicOrigin();
  const key = getServerEnv().API_CRM_PARTNER_KEY;
  if (!origin || !key) return null;

  const url = `${origin}/api/partners/api-crm/listings/${encodeURIComponent(code)}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${key}`, accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });

      // Si hubo redirect, MOTORBOX_PUBLIC_ORIGIN está mal configurada (falta el
      // `www`, por ejemplo). Varios clientes HTTP descartan el header
      // Authorization al seguir un redirect entre hosts distintos —es una
      // protección para no filtrar credenciales—, así que el síntoma sería un
      // 401 intermitente que no se parece en nada a su causa. Lo decimos acá.
      if (res.redirected) {
        console.error(
          `[motorbox] MOTORBOX_PUBLIC_ORIGIN redirige (${url} → ${res.url}). ` +
            "Usá el host canónico exacto: un redirect puede tirar el Bearer y dar 401.",
        );
      }

      // 404 = el código no existió nunca. No tiene sentido reintentar.
      if (res.status === 404) return null;
      if (!res.ok) {
        if (attempt === 0) continue;
        console.error(`[motorbox] listing ${code}: HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as { ok?: boolean; listing?: MotorboxListing };
      return data.listing ?? null;
    } catch (e) {
      if (attempt === 0) continue;
      console.error(`[motorbox] listing ${code}:`, (e as Error).message);
      return null;
    }
  }
  return null;
}

/** Una línea legible con el auto y su precio, para la nota del lead. */
export function describeListing(listing: MotorboxListing): string {
  const parts = [listing.brand, listing.model, listing.version, listing.year]
    .filter(Boolean)
    .join(" ");
  const bits: string[] = [parts || "Vehículo"];
  if (listing.km != null) bits.push(`${listing.km.toLocaleString("es-AR")} km`);
  if (listing.price != null) {
    // La moneda viaja con el precio: Motorbox admite ARS y USD y no convierte.
    bits.push(`${listing.currency ?? "ARS"} ${listing.price.toLocaleString("es-AR")}`);
  }
  if (listing.url) bits.push(listing.url);
  return bits.join(" · ");
}
