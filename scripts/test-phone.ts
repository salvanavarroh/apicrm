/**
 * Test del normalizador de teléfonos multi-país (Fase 0 mensajería).
 * Sin framework: corre con `pnpm test:phone`. Sale con código != 0 si falla.
 */
import { normalizeWaId, toE164 } from "@/lib/phone";

type Case = { raw: string; region: string; expect: string | null; note: string };

const cases: Case[] = [
  // Argentina — el "9" del móvil y el "15" legacy son la trampa clásica.
  // Sin indicador de móvil (15/9), "11 5555-1234" es FIJO (correcto): no lleva 9.
  { raw: "11 5555-1234", region: "AR", expect: "+541155551234", note: "AR fijo (sin 15/9)" },
  // Estas 3 (form con 15, WhatsApp/LeadAds internacional) colapsan al MISMO móvil:
  { raw: "011 15 5555 1234", region: "AR", expect: "+5491155551234", note: "AR móvil con 0 y 15" },
  { raw: "+54 9 11 5555-1234", region: "AR", expect: "+5491155551234", note: "AR móvil internacional con 9" },
  { raw: "5491155551234", region: "AR", expect: "+5491155551234", note: "AR wa_id móvil (WhatsApp)" },

  // México — Meta sacó el "1" de los móviles.
  { raw: "55 1234 5678", region: "MX", expect: "+525512345678", note: "MX CDMX local" },
  { raw: "525512345678", region: "MX", expect: "+525512345678", note: "MX wa_id" },

  // Chile / Colombia / Perú / Uruguay.
  { raw: "9 6123 4567", region: "CL", expect: "+56961234567", note: "CL móvil" },
  { raw: "320 1234567", region: "CO", expect: "+573201234567", note: "CO móvil" },
  { raw: "912 345 678", region: "PE", expect: "+51912345678", note: "PE móvil" },
  { raw: "099 123 456", region: "UY", expect: "+59899123456", note: "UY móvil" },

  // Internacional gana sobre la región.
  { raw: "+525512345678", region: "AR", expect: "+525512345678", note: "MX explícito aunque región AR" },

  // Basura → null.
  { raw: "123", region: "AR", expect: null, note: "muy corto" },
  { raw: "", region: "AR", expect: null, note: "vacío" },
];

let failed = 0;
for (const c of cases) {
  const got = toE164(c.raw, c.region);
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(
    `${ok ? "✓" : "✗"} [${c.region}] "${c.raw}" → ${got ?? "null"}` +
      (ok ? "" : `  (esperado: ${c.expect ?? "null"})  — ${c.note}`),
  );
}

// Quirks de wa_id de WhatsApp (Fase 2): AR sin "9", MX con "1" de más.
const waCases: Case[] = [
  { raw: "541155551234", region: "AR", expect: "+5491155551234", note: "AR wa_id sin 9 → agrega 9" },
  { raw: "5491155551234", region: "AR", expect: "+5491155551234", note: "AR wa_id ya con 9" },
  { raw: "5215512345678", region: "MX", expect: "+525512345678", note: "MX wa_id con 1 legacy → lo quita" },
  { raw: "525512345678", region: "MX", expect: "+525512345678", note: "MX wa_id ya sin 1" },
];
for (const c of waCases) {
  const got = normalizeWaId(c.raw, c.region);
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(
    `${ok ? "✓" : "✗"} [wa_id ${c.region}] "${c.raw}" → ${got ?? "null"}` +
      (ok ? "" : `  (esperado: ${c.expect ?? "null"})  — ${c.note}`),
  );
}

const total = cases.length + waCases.length;
console.log(`\n${total - failed}/${total} OK`);
if (failed > 0) process.exit(1);
