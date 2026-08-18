import { createHash } from "node:crypto";

import Papa from "papaparse";

import { toE164 } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================================
// Sincronización de leads desde una planilla de Google.
//
// Caso principal: TikTok Lead Gen escribe automáticamente en una hoja a medida
// que entran leads, y nosotros la polleamos.
//
// CÓMO SE LEE LA PLANILLA
// Se usa el endpoint de export a CSV de Google, que no requiere credenciales:
//   https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<GID>
// La contrapartida es que la planilla tiene que estar compartida como "cualquier
// persona con el enlace puede ver". Es un dato de privacidad a decidir: por eso
// conviene que esa hoja contenga SÓLO el feed de leads y nada más.
//
// Si más adelante se quiere sin compartir, se cambia `fetchSheetCsv` por una
// llamada con service account: el resto del archivo no se toca.
// ============================================================================

/** Campos del lead que se pueden mapear desde una columna de la planilla. */
export const MAPPABLE_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "city",
  "vehicle_brand",
  "vehicle_model",
  "vehicle_version",
  "initial_notes",
] as const;

export type MappableField = (typeof MAPPABLE_FIELDS)[number];

export const FIELD_LABELS: Record<MappableField, string> = {
  first_name: "Nombre",
  last_name: "Apellido",
  phone: "Teléfono",
  email: "Email",
  city: "Ciudad",
  vehicle_brand: "Marca",
  vehicle_model: "Modelo",
  vehicle_version: "Versión",
  initial_notes: "Notas / mensaje",
};

export type SyncResult = {
  ok: boolean;
  read: number;
  imported: number;
  skippedDuplicate: number;
  skippedNoContact: number;
  skippedAlreadySynced: number;
  message: string;
};

export function csvUrl(spreadsheetId: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

async function fetchSheetCsv(
  spreadsheetId: string,
  gid: string,
): Promise<string> {
  const res = await fetch(csvUrl(spreadsheetId, gid), {
    // Sin cache: el punto es ver las filas nuevas.
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "No se encontró la planilla. Revisá el ID y el gid de la hoja."
        : `Google devolvió ${res.status}. Si es 401/403, la planilla no está compartida por enlace.`,
    );
  }
  const text = await res.text();
  // Cuando la planilla no es pública, Google devuelve 200 con una página HTML de
  // login en vez del CSV. Hay que detectarlo o se parsea basura como si fueran
  // leads.
  if (text.trimStart().startsWith("<")) {
    throw new Error(
      "La planilla no es accesible por enlace: Google devolvió una página de login en vez del CSV.",
    );
  }
  return text;
}

/** Huella estable de una fila. Ordena las claves para no depender del orden. */
function rowHash(row: Record<string, string>): string {
  const normalized = Object.keys(row)
    .sort()
    .map((k) => `${k}=${(row[k] ?? "").trim()}`)
    .join("|");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

type SheetSource = {
  id: string;
  company_id: string;
  spreadsheet_id: string;
  gid: string;
  column_map: Record<string, string>;
  branch_id: string | null;
  product_type_id: string | null;
  campaign_id: string | null;
};

/**
 * Sincroniza una fuente. Idempotente: las filas ya importadas se saltean por
 * hash, así que se puede correr todas las veces que se quiera.
 */
export async function syncSheetSource(
  source: SheetSource,
  opts?: { limit?: number },
): Promise<SyncResult> {
  const admin = createAdminClient();
  const empty: SyncResult = {
    ok: false,
    read: 0,
    imported: 0,
    skippedDuplicate: 0,
    skippedNoContact: 0,
    skippedAlreadySynced: 0,
    message: "",
  };

  let csv: string;
  try {
    csv = await fetchSheetCsv(source.spreadsheet_id, source.gid);
  } catch (e) {
    return { ...empty, message: (e as Error).message };
  }

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  const rows = (parsed.data ?? []).filter((r) =>
    Object.values(r).some((v) => (v ?? "").trim() !== ""),
  );
  if (rows.length === 0) {
    return { ...empty, ok: true, message: "La planilla no tiene filas." };
  }

  const map = source.column_map ?? {};
  const pick = (row: Record<string, string>, field: MappableField) => {
    const col = map[field];
    if (!col) return "";
    return (row[col] ?? "").trim();
  };

  // Filas ya importadas de esta fuente.
  const { data: already } = await admin
    .from("sheet_synced_rows")
    .select("row_hash")
    .eq("source_id", source.id);
  const seen = new Set((already ?? []).map((r) => r.row_hash));

  const candidates = rows.slice(0, opts?.limit ?? rows.length);

  let imported = 0;
  let skippedDuplicate = 0;
  let skippedNoContact = 0;
  let skippedAlreadySynced = 0;

  for (const row of candidates) {
    const hash = rowHash(row);
    if (seen.has(hash)) {
      skippedAlreadySynced++;
      continue;
    }

    const rawPhone = pick(row, "phone");
    const email = pick(row, "email").toLowerCase();
    // El país sale de la empresa más adelante; AR es el default del piloto.
    const phoneE164 = rawPhone ? toE164(rawPhone, "AR") : null;

    // Sin teléfono ni email no hay forma de contactarlo: la propia tabla `leads`
    // lo rechaza por constraint, así que se descarta acá con un motivo claro.
    if (!phoneE164 && !email) {
      skippedNoContact++;
      // Se marca como vista para no reintentarla en cada corrida.
      await admin
        .from("sheet_synced_rows")
        .insert({ source_id: source.id, row_hash: hash, lead_id: null });
      continue;
    }

    // Duplicado contra los leads que ya existen en la empresa.
    const orParts: string[] = [];
    if (phoneE164) orParts.push(`phone_e164.eq.${phoneE164}`);
    if (email) orParts.push(`email.eq.${email}`);
    const { data: dupes } = await admin
      .from("leads")
      .select("id")
      .eq("company_id", source.company_id)
      .or(orParts.join(","))
      .limit(1);

    if (dupes && dupes.length > 0) {
      skippedDuplicate++;
      await admin.from("sheet_synced_rows").insert({
        source_id: source.id,
        row_hash: hash,
        lead_id: dupes[0].id,
      });
      continue;
    }

    const { data: created, error } = await admin
      .from("leads")
      .insert({
        company_id: source.company_id,
        first_name: pick(row, "first_name") || null,
        last_name: pick(row, "last_name") || null,
        phone: rawPhone || null,
        phone_e164: phoneE164,
        email: email || null,
        city: pick(row, "city") || null,
        vehicle_brand: pick(row, "vehicle_brand") || null,
        vehicle_model: pick(row, "vehicle_model") || null,
        vehicle_version: pick(row, "vehicle_version") || null,
        initial_notes: pick(row, "initial_notes") || null,
        branch_id: source.branch_id,
        product_type_id: source.product_type_id,
        campaign_id: source.campaign_id,
        source: "Google Sheets",
        // Queda la fila cruda: cuando algo no cuadra, es la única forma de
        // saber qué había realmente en la planilla.
        metadata: { sheetSourceId: source.id, sheetRow: row },
      })
      .select("id")
      .single();

    if (error) {
      // Una fila mala no debe cortar la corrida entera.
      await admin
        .from("sheet_synced_rows")
        .insert({ source_id: source.id, row_hash: hash, lead_id: null });
      continue;
    }

    imported++;
    await admin.from("sheet_synced_rows").insert({
      source_id: source.id,
      row_hash: hash,
      lead_id: created.id,
    });
  }

  const message =
    `${imported} lead(s) nuevos` +
    (skippedDuplicate ? ` · ${skippedDuplicate} duplicado(s)` : "") +
    (skippedNoContact ? ` · ${skippedNoContact} sin contacto` : "") +
    (skippedAlreadySynced ? ` · ${skippedAlreadySynced} ya importado(s)` : "");

  await admin
    .from("sheet_sources")
    .update({
      last_synced_at: new Date().toISOString(),
      last_result: message,
      last_error: null,
    })
    .eq("id", source.id);

  // El acumulado se incrementa aparte, leyendo el valor actual: sumar sobre una
  // lectura vieja perdería lo que importó otra corrida en paralelo.
  if (imported > 0) {
    const { data: cur } = await admin
      .from("sheet_sources")
      .select("total_imported")
      .eq("id", source.id)
      .maybeSingle();
    await admin
      .from("sheet_sources")
      .update({ total_imported: (cur?.total_imported ?? 0) + imported })
      .eq("id", source.id);
  }

  return {
    ok: true,
    read: rows.length,
    imported,
    skippedDuplicate,
    skippedNoContact,
    skippedAlreadySynced,
    message,
  };
}

/** Detecta los encabezados de la planilla, para armar el mapeo en la UI. */
export async function readSheetHeaders(
  spreadsheetId: string,
  gid: string,
): Promise<{ ok: boolean; headers: string[]; sample: Record<string, string>[]; message: string }> {
  try {
    const csv = await fetchSheetCsv(spreadsheetId, gid);
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    const headers = (parsed.meta.fields ?? []).filter(Boolean);
    return {
      ok: true,
      headers,
      sample: (parsed.data ?? []).slice(0, 3),
      message: `${headers.length} columna(s), ${(parsed.data ?? []).length} fila(s)`,
    };
  } catch (e) {
    return { ok: false, headers: [], sample: [], message: (e as Error).message };
  }
}

/** Sugiere un mapeo por nombre de columna. Ahorra el 90% del trabajo manual. */
export function guessColumnMap(headers: string[]): Record<string, string> {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim();

  const patterns: Record<MappableField, string[]> = {
    first_name: ["nombre", "first name", "first_name", "full name", "nombre completo"],
    last_name: ["apellido", "last name", "last_name"],
    phone: ["telefono", "phone", "celular", "whatsapp", "phone number", "tel"],
    email: ["email", "correo", "mail", "e-mail"],
    city: ["ciudad", "city", "localidad"],
    vehicle_brand: ["marca", "brand"],
    vehicle_model: ["modelo", "model", "vehiculo", "auto"],
    vehicle_version: ["version", "trim"],
    initial_notes: ["mensaje", "message", "comentario", "consulta", "notas"],
  };

  const out: Record<string, string> = {};
  for (const field of MAPPABLE_FIELDS) {
    const found = headers.find((h) =>
      patterns[field].some((p) => norm(h) === p || norm(h).includes(p)),
    );
    if (found) out[field] = found;
  }
  return out;
}
