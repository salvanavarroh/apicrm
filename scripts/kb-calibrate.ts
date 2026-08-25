/**
 * Calibra el umbral de "no sé" del asistente con datos reales.
 *
 * `MIN_SIMILARITY` decide cuándo el asistente contesta y cuándo dice que no
 * sabe. Es EL parámetro del sistema: muy bajo y contesta cualquier cosa, muy
 * alto y dice "no sé" a preguntas que podría responder. Ponerlo a ojo es
 * adivinar — esto lo mide.
 *
 * Corre dos conjuntos contra la base ya indexada (preguntas que TIENEN que
 * responderse y preguntas que NO existen en el CRM), imprime la similitud del
 * mejor fragmento de cada una y muestra qué pasa con cada umbral candidato.
 *
 * Uso:  pnpm kb:calibrate   (requiere .env.local y la base indexada)
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const RELEVANTES: [string, string][] = [
  ["¿cómo se reparten los leads entre los vendedores?", "manager"],
  ["si un cliente vuelve a consultar, ¿le toca el mismo vendedor?", "sales"],
  ["¿qué pasa con un lead sin sucursal?", "admin"],
  ["¿cuándo pasa un lead a Presupuestado?", "sales"],
  ["¿qué significa la temperatura de un lead?", "sales"],
  ["¿qué reportes puedo mirar?", "admin"],
  ["¿qué variables puedo usar en una plantilla?", "sales"],
  ["¿de dónde saca el precio el cotizador de usados?", "admin"],
  ["¿el bot puede hablar de precios?", "admin"],
  ["¿cómo cambio de marca en un grupo?", "admin"],
  ["¿qué canales de origen hay para una campaña?", "admin"],
  ["¿qué puedo hacer siendo vendedor?", "sales"],
  ["¿qué prioridades tiene una tarea?", "sales"],
  ["¿cómo importo una base de leads?", "admin"],
  ["¿quién aprueba una venta?", "sales"],
  ["¿qué es una gerencia?", "manager"],
  ["¿cómo invito a un vendedor?", "manager"],
  ["¿qué pasa si un lead entra dos veces?", "admin"],
];

const IRRELEVANTES: [string, string][] = [
  ["¿cómo emito una factura electrónica de AFIP?", "admin"],
  ["¿cómo conecto el CRM con SAP?", "admin"],
  ["¿cuál es la temperatura en Córdoba?", "sales"],
  ["¿cómo cargo el stock de repuestos?", "admin"],
  ["¿dónde veo el libro de sueldos?", "admin"],
  ["¿cuánto está el dólar hoy?", "sales"],
  ["¿cómo hago un asiento contable?", "admin"],
  ["receta de milanesas", "sales"],
  ["¿cómo pido vacaciones?", "sales"],
  ["¿el CRM tiene app para reloj inteligente?", "admin"],
];

const FEATURES = ["inbox", "bot", "cotizador", "sheets", "ads", "forms"];

async function main() {
  const { embedOne, toPgVector } = await import("@/lib/ai/embed");
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  async function top(q: string, role: string) {
    const e = await embedOne(q);
    if (!e.ok) throw new Error(e.reason);
    const { data, error } = await admin.rpc("match_kb", {
      query_embedding: toPgVector(e.vector),
      query_text: q,
      p_role: role,
      p_features: FEATURES,
      match_count: 5,
    });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { similarity: number; text_rank: number | null; slug: string }[];
    return {
      sim: rows.length ? Math.max(...rows.map((r) => r.similarity)) : 0,
      tr: rows.length ? Math.min(...rows.map((r) => r.text_rank ?? 999)) : 999,
      slug: rows[0]?.slug ?? "-",
    };
  }

  const rel: number[] = [], irr: number[] = [];
  console.log("\nRELEVANTES (deben pasar)");
  for (const [q, r] of RELEVANTES) {
    const t = await top(q, r);
    rel.push(t.sim);
    console.log(`  sim ${t.sim.toFixed(3)}  txt#${String(t.tr).padStart(3)}  ${t.slug.padEnd(26)} ${q}`);
  }
  console.log("\nIRRELEVANTES (deben dar «no sé»)");
  for (const [q, r] of IRRELEVANTES) {
    const t = await top(q, r);
    irr.push(t.sim);
    console.log(`  sim ${t.sim.toFixed(3)}  txt#${String(t.tr).padStart(3)}  ${t.slug.padEnd(26)} ${q}`);
  }

  const minRel = Math.min(...rel), maxIrr = Math.max(...irr);
  console.log(`\nrelevante  mín ${minRel.toFixed(3)}  ·  irrelevante máx ${maxIrr.toFixed(3)}`);
  console.log(minRel > maxIrr
    ? `SEPARAN. Umbral sugerido: ${((minRel + maxIrr) / 2).toFixed(2)}`
    : `SE SOLAPAN por ${(maxIrr - minRel).toFixed(3)} — la similitud sola no alcanza.`);

  for (const th of [0.35, 0.40, 0.45, 0.50, 0.52, 0.55, 0.60]) {
    const ok = rel.filter((s) => s >= th).length;
    const leaks = irr.filter((s) => s >= th).length;
    console.log(`  umbral ${th.toFixed(2)}  →  relevantes que pasan ${ok}/${rel.length}  ·  irrelevantes que se cuelan ${leaks}/${irr.length}`);
  }
}
void main();
