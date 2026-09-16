/**
 * Tests del reparto de leads.
 *
 * Dos partes, igual que `test:permissions`:
 *
 *  1. PURA — propiedades de la rueda (`buildWheel`, `reduceWeights`). Corre
 *     siempre, sin red ni base.
 *
 *  2. CONTRA LA BASE — compara la rueda de SQL con la de TS. Es la que de
 *     verdad importa: la de SQL reparte y la de TS dibuja el preview del
 *     diálogo, así que si no coinciden la pantalla le miente al admin sobre lo
 *     que va a pasar. Necesita credenciales y al menos 2 vendedores activos; si
 *     no, se saltea con un aviso en vez de fallar.
 *
 * Uso:  pnpm test:assignment
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { createClient } from "@supabase/supabase-js";

import { buildWheel, reduceWeights } from "@/lib/assignment-rules";
import type { Database } from "@/types/database";

let fails = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fails++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const C = "cccccccc-0000-0000-0000-000000000003";

function wheelOf(pairs: [string, number][]): string {
  const letters = new Map([[A, "A"], [B, "B"], [C, "C"]]);
  return buildWheel(pairs.map(([userId, weight]) => ({ userId, weight })))
    .map((id) => letters.get(id) ?? "?")
    .join("");
}

function pure() {
  console.log("\n— La rueda —");

  check("pesos iguales rotan uno a uno", wheelOf([[A, 1], [B, 1]]) === "AB",
    wheelOf([[A, 1], [B, 1]]));
  check("tres parejos", wheelOf([[A, 1], [B, 1], [C, 1]]) === "ABC",
    wheelOf([[A, 1], [B, 1], [C, 1]]));

  // Lo que hace que el % sea usable: 70/30 no puede dar siete A seguidos.
  const w73 = wheelOf([[A, 7], [B, 3]]);
  check("70/30 reparte 7 y 3", w73.split("A").length - 1 === 7 && w73.length === 10, w73);
  check("70/30 NO agrupa", !w73.includes("AAAA"), w73);

  const w51 = wheelOf([[A, 5], [B, 1]]);
  check("5/1 pone al de menos peso en el medio", w51.indexOf("B") > 0 && w51.indexOf("B") < 5, w51);

  check("un solo vendedor es una rueda de un lugar", wheelOf([[A, 1]]) === "A");

  // reduceWeights: el preview muestra el ciclo entero, no un tramo.
  const red = reduceWeights([{ userId: A, weight: 70 }, { userId: B, weight: 30 }]);
  check("70/30 se simplifica a 7/3", red[0].weight === 7 && red[1].weight === 3,
    `${red[0].weight}/${red[1].weight}`);
  const red2 = reduceWeights([{ userId: A, weight: 2 }, { userId: B, weight: 3 }]);
  check("2/3 ya es mínimo", red2[0].weight === 2 && red2[1].weight === 3);

  // La proporción tiene que sobrevivir a la simplificación: es lo que garantiza
  // que el preview (que usa los pesos reducidos) muestre el reparto real.
  const w70 = wheelOf(red.map((m) => [m.userId, m.weight] as [string, number]));
  check("70/30 reducido da la misma rueda que 7/3", w70 === w73, w70);

  check("determinística", wheelOf([[A, 3], [B, 2]]) === wheelOf([[A, 3], [B, 2]]));
}

async function againstDb() {
  console.log("\n— Contra la base —");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("  ⚠ Sin credenciales de Supabase: se saltea.");
    return;
  }
  const db = createClient<Database>(url, key, { auth: { persistSession: false } });

  // Cualquier empresa que tenga al menos 2 vendedores activos sirve. Buscarla
  // en vez de agarrar la primera: con la primera, el test se salteaba en
  // silencio sólo porque esa empresa no tenía equipo cargado.
  const { data: companies } = await db.from("companies").select("id, name");
  let company: { id: string; name: string } | null = null;
  let vendors: { id: string }[] = [];
  for (const c of companies ?? []) {
    const { data } = await db
      .from("profiles")
      .select("id")
      .eq("company_id", c.id)
      .eq("role", "sales")
      .eq("status", "active")
      .order("id")
      .limit(3);
    if ((data?.length ?? 0) >= 2) {
      company = c;
      vendors = data!;
      break;
    }
  }

  if (!company) {
    console.log("  ⚠ Ninguna empresa tiene 2 vendedores activos: se saltea.");
    console.log("    Es la comprobación de que el preview del diálogo no miente.");
    return;
  }
  console.log(`  · probando con ${company.name} (${vendors.length} vendedores)`);

  const { data: rule } = await db
    .from("assignment_rules")
    .insert({ company_id: company.id, name: "__test_wheel__", strategy: "turns" })
    .select("id")
    .single();
  if (!rule) {
    console.log("  ✗ No se pudo crear la regla de prueba.");
    fails++;
    return;
  }

  const cases: number[][] = vendors.length >= 3
    ? [[1, 1], [7, 3], [1, 1, 1], [1, 2, 3], [5, 1]]
    : [[1, 1], [7, 3], [5, 1], [2, 3]];

  try {
    for (const weights of cases) {
      const members = reduceWeights(
        weights.map((w, i) => ({ userId: vendors[i].id, weight: w })),
      );
      await db.from("assignment_rule_members").delete().eq("rule_id", rule.id);
      await db.from("assignment_rule_members").insert(
        members.map((m) => ({
          rule_id: rule.id,
          user_id: m.userId,
          company_id: company.id,
          weight: m.weight,
        })),
      );
      const { data: sql, error } = await db.rpc("assignment_wheel", { p_rule_id: rule.id });
      if (error) {
        check(`[${weights.join("/")}]`, false, error.message);
        continue;
      }
      const fromSql = (sql ?? [])
        .slice()
        .sort((a, b) => a.slot - b.slot)
        .map((r) => r.user_id)
        .join(",");
      const fromTs = buildWheel(members).join(",");
      check(`[${weights.join("/")}] SQL == TS`, fromSql === fromTs);
    }
  } finally {
    await db.from("assignment_rules").delete().eq("id", rule.id);
  }
}

async function main() {
  pure();
  await againstDb();
  console.log(fails === 0 ? "\nTodo bien.\n" : `\n${fails} problema(s).\n`);
  process.exit(fails === 0 ? 0 : 1);
}

void main();
