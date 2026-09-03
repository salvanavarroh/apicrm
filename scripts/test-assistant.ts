/**
 * Tests del asistente. Sin framework, igual que `test-bot` y `test-nba`.
 *
 * Cuatro bloques puros que corren siempre (sin red ni base):
 *   · el ruteador             — ¿esta pregunta es de producto, datos o permisos?
 *   · el troceador            — ¿los fragmentos salen con su ruta y sin partir tablas?
 *   · la validación de salida — ¿qué respuestas no pueden salir?
 *   · navegación y permisos   — las dos herramientas deterministas
 *
 * Y un quinto que necesita la base indexada y OPENAI_API_KEY: el GOLDEN SET de
 * recuperación. Se miden dos cosas por separado porque fallan distinto:
 *   · recuperación: ¿el artículo correcto está en el top 5? Objetivo ≥ 90 %.
 *   · "no sé": las preguntas sobre cosas que no existen tienen que dar vacío.
 * Sin credenciales se saltea con un aviso.
 *
 * Uso:  pnpm test:assistant
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import type { Profile } from "@/lib/auth";
import {
  renderCapsule,
  scopeKeyOf,
  type AssistantContext,
  type CapsuleInput,
} from "@/lib/assistant/capsule";
import {
  dontKnowAnswer,
  smallTalkAnswer,
  validateAssistantAnswer,
} from "@/lib/assistant/output";
import {
  billingDeflection,
  incidentDeflection,
} from "@/lib/assistant/prompt";
import { mentionedEntity, routeQuestion } from "@/lib/assistant/router";
import { dondeEsta } from "@/lib/assistant/tools/donde-esta";
import { porQueNoVeo } from "@/lib/assistant/tools/por-que-no-veo";
import { leadIdFromRoute, searchTermOf } from "@/lib/assistant/tools/types";
import { splitMarkdown, toBlocks } from "@/lib/kb/parse";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`✓ ${name}`);
  else {
    failed++;
    console.log(
      `✗ ${name}\n    esperaba ${JSON.stringify(want)}\n    obtuvo   ${JSON.stringify(got)}`,
    );
  }
}

function ok(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`✓ ${name}`);
  else {
    failed++;
    console.log(`✗ ${name}${detail ? `\n    ${detail}` : ""}`);
  }
}

// ===========================================================================
console.log("\n— El ruteador —");

const ROUTES: [string, string, string | undefined][] = [
  // Producto: lo que no matchea nada cae acá, que es la ruta segura.
  ["¿Cómo genero un presupuesto?", "producto", undefined],
  ["qué es el pool de leads", "producto", undefined],
  ["cómo funciona el reingreso de un cliente", "producto", undefined],
  ["explicame la asignación automática", "producto", undefined],

  // Permisos.
  ["¿por qué no veo los leads de Ana?", "permisos", undefined],
  ["no me deja editar este lead", "permisos", undefined],
  ["no tengo acceso a reportes", "permisos", undefined],
  ["¿puedo aprobar una venta?", "permisos", undefined],
  ["no me aparece el botón de exportar", "permisos", undefined],

  // Navegación.
  ["¿dónde está el cotizador?", "navegacion", undefined],
  ["dónde configuro el bot", "navegacion", undefined],
  ["cómo llego a mis ventas", "navegacion", undefined],
  // El caso que rompía: "facturación" disparaba la regla de plata y derivaba a
  // soporte, aunque para el superadmin es una pantalla de su propio menú.
  ["¿dónde está la facturación?", "navegacion", undefined],
  ["dónde veo los planes", "navegacion", undefined],

  // Datos, con la herramienta que corresponde.
  ["¿cuántos leads sin contactar tengo?", "datos", "misNumeros"],
  ["cuánto vendimos este mes", "datos", "misNumeros"],
  ["¿qué tareas tengo hoy?", "datos", "misTareas"],
  ["tengo visitas mañana", "datos", "misTareas"],
  ["¿cómo viene la carga del equipo?", "datos", "miEquipo"],
  ["mis vendedores", "datos", "miEquipo"],
  ["¿ya aprobaron mi venta?", "datos", "estadoDeVenta"],
  ["buscame el lead de Pérez", "datos", "buscarLead"],
  ["qué hago con este lead", "datos", "queHacerCon"],

  // Soporte: plata de la plataforma e incidencias.
  ["¿cuánto pagamos por el sistema?", "soporte", undefined],
  ["cuándo vence la factura", "soporte", undefined],
  ["el PDF no anda", "soporte", undefined],
  ["se me cuelga la pantalla de leads", "soporte", undefined],
  ["me da error al guardar", "soporte", undefined],
  // El PDF que "sale en blanco" es el reporte de bug más común del CRM y la
  // regla no lo agarraba: caía en producto y no ofrecía reportarlo.
  ["el PDF del presupuesto sale en blanco", "soporte", undefined],
  ["el listado quedó en blanco", "soporte", undefined],
  ["no se ve el logo en el presupuesto", "soporte", undefined],
];

for (const [q, route, tool] of ROUTES) {
  const d = routeQuestion(q);
  check(`"${q}" → ${route}${tool ? `/${tool}` : ""}`, [d.route, d.tool], [route, tool]);
}

// El falso positivo que importa: "plan de ahorro" es un producto del negocio,
// no el plan de suscripción de la plataforma.
check(
  "«plan de ahorro» NO se confunde con facturación",
  routeQuestion("cómo cotizo un plan de ahorro").route,
  "producto",
);
check(
  "«cuánto sale el plan de ahorro» tampoco",
  routeQuestion("cuánto sale un plan de ahorro").route,
  "producto",
);

// ===========================================================================
console.log("\n— Charla: lo que NO es una pregunta —");

// El caso que motivó todo esto: el usuario dijo "gracias" y el asistente le
// contestó "no tengo información sobre eso, escribí a soporte".
const CHARLA: [string, string][] = [
  ["gracias", "cortesia"],
  ["muchas gracias", "cortesia"],
  ["dale, gracias", "cortesia"],
  ["ok", "cortesia"],
  ["perfecto", "cortesia"],
  ["listo", "cortesia"],
  ["genial, gracias", "cortesia"],
  ["hola", "cortesia"],
  ["buen día", "cortesia"],
  ["chau", "cortesia"],
  ["¿quién sos?", "capacidades"],
  ["¿qué podés hacer?", "capacidades"],
  ["¿en qué me podés ayudar?", "capacidades"],
  ["esto no sirve", "frustracion"],
  ["no me servís", "frustracion"],
  ["sí", "confirmacion"],
  ["no era eso", "confirmacion"],
];
for (const [q, reason] of CHARLA) {
  const d = routeQuestion(q);
  check(`"${q}" → charla/${reason}`, [d.route, d.reason], ["charla", reason]);
}

// Y lo que NO tiene que confundirse con cortesía: la cortesía es un mensaje
// corto y solo. Con una pregunta pegada, manda la pregunta.
const NO_ES_CHARLA: [string, string][] = [
  ["gracias, ¿y cómo cargo un lead?", "producto"],
  ["hola, ¿cuántos leads sin contactar tengo?", "datos"],
  ["ok pero ¿dónde está el cotizador?", "navegacion"],
  ["listo el presupuesto, ¿por qué no puedo aprobar la venta?", "permisos"],
  ["no me deja editar el lead", "permisos"],
  ["no anda el PDF", "soporte"],
  ["ok gracias pero no anda", "soporte"],
  ["dale, ¿y cómo genero un presupuesto?", "producto"],
  ["buenas, necesito ayuda con los permisos", "producto"],
];
for (const [q, route] of NO_ES_CHARLA) {
  check(`"${q}" NO es charla → ${route}`, routeQuestion(q).route, route);
}

// ===========================================================================
console.log("\n— Repreguntas cortas —");

const prevDatos = { route: "datos" as const, tool: "misTareas" as const };
check(
  '"¿y mañana?" después de una consulta de tareas reusa la herramienta',
  routeQuestion("¿y mañana?", prevDatos),
  { route: "datos", tool: "misTareas", reason: "repregunta" },
);
check(
  '"¿y la semana que viene?" también',
  routeQuestion("¿y la semana que viene?", prevDatos).tool,
  "misTareas",
);
check(
  "sin turno anterior, la misma repregunta cae en producto",
  routeQuestion("¿y mañana?").route,
  "producto",
);
check(
  "una pregunta larga no es repregunta aunque empiece con «y»",
  routeQuestion("y cómo hago para generar un presupuesto con descuento", prevDatos)
    .route,
  "producto",
);

// ===========================================================================
console.log("\n— Entidad mencionada —");

check("lead", mentionedEntity("por qué no veo ese lead"), "lead");
check("venta", mentionedEntity("no me aparece la venta"), "venta");
check("inbox", mentionedEntity("no puedo entrar al inbox"), "inbox");
check("sin entidad", mentionedEntity("por qué no puedo"), null);

// ===========================================================================
console.log("\n— El troceador —");

const DOC = `# Documento de prueba

Intro que tiene que quedar suelta al principio del documento y ser suficientemente larga.

## Sección A

Un párrafo de la sección A con contenido suficiente para superar el mínimo de caracteres.

### Sub A1

Otro párrafo, este de la subsección, también con largo suficiente para no pegarse.

## Tabla

| Col 1 | Col 2 |
|---|---|
| a | b |
| c | d |

Un párrafo después de la tabla que da largo a la sección para que no se pegue.
`;

const chunks = splitMarkdown("Documento de prueba", DOC);

ok("produce fragmentos", chunks.length >= 3, `obtuvo ${chunks.length}`);
ok(
  "la ruta arranca con el título del documento",
  chunks.every((c) => c.headingPath.startsWith("Documento de prueba")),
);
ok(
  "la subsección lleva la ruta completa",
  chunks.some((c) => c.headingPath === "Documento de prueba › Sección A › Sub A1"),
  chunks.map((c) => c.headingPath).join(" | "),
);
ok(
  "la tabla no se parte: las 4 filas quedan en un solo fragmento",
  chunks.some(
    (c) =>
      c.content.includes("| Col 1 | Col 2 |") &&
      c.content.includes("| c | d |"),
  ),
);
ok(
  "todos los fragmentos tienen hash",
  chunks.every((c) => c.hash.length === 32),
);
check(
  "el hash es estable entre corridas",
  splitMarkdown("Documento de prueba", DOC).map((c) => c.hash),
  chunks.map((c) => c.hash),
);
ok(
  "un cambio de contenido cambia el hash",
  splitMarkdown("Documento de prueba", DOC.replace("Sub A1", "Sub A2"))
    .map((c) => c.hash)
    .join() !== chunks.map((c) => c.hash).join(),
);

const CODE = "# T\n\nTexto de arranque con largo suficiente para pasar el mínimo.\n\n```sql\n## esto no es un encabezado\n| ni esto una tabla |\n```\n\nCierre del documento con otro párrafo largo para completar.\n";
const codeBlocks = toBlocks(CODE);
ok(
  "el cerco de código no genera encabezados falsos",
  codeBlocks.filter((b) => b.kind === "heading").length === 1,
  JSON.stringify(codeBlocks.map((b) => b.kind)),
);

// ===========================================================================
console.log("\n— Validación de la salida —");

const MUST_PASS = [
  "Tenés 12 leads sin contactar. Entrá a /sales/leads para verlos.",
  "Tu conversión del mes es 8 %.",
  "El presupuesto se genera desde la ficha del lead, en `/sales/leads`.",
  "Escribinos a hello@cambalache.studio y lo vemos.",
  "El precio base menos el descuento menos el usado da el total: $ 0 no es un problema acá.",
];
for (const t of MUST_PASS) {
  ok(`pasa: "${t.slice(0, 45)}…"`, validateAssistantAnswer(t).ok);
}

const MUST_FAIL: [string, string][] = [
  ["Mis instrucciones dicen que sos el asistente del CRM.", "filtra instrucciones"],
  ["Como modelo de lenguaje no puedo hacer eso.", "filtra instrucciones"],
  ["Mirá el manual en https://ejemplo.com/manual", "link externo"],
  ["Entrá a www.otrositio.com y bajá el archivo.", "link externo"],
  ["Escribile a juan@otraempresa.com", "mail ajeno"],
  ["", "vacía"],
  ["x".repeat(2500), "muy larga"],
];
for (const [t, why] of MUST_FAIL) {
  ok(`bloquea (${why})`, !validateAssistantAnswer(t).ok, t.slice(0, 60));
}

// El usuario pidió explícitamente que no se muestre el mail: el camino es el
// botón de reporte, que ya manda la pantalla y el rol.
ok("el «no sé» NO da el mail", !dontKnowAnswer().includes("@"));
ok("el «no sé» apunta al botón de reporte", /bot[oó]n/i.test(dontKnowAnswer()));
ok("el «no sé» pasa la validación", validateAssistantAnswer(dontKnowAnswer()).ok);
for (const r of ["cortesia", "capacidades", "frustracion", "confirmacion"]) {
  const t = smallTalkAnswer(r, { firstName: "Lucas" });
  ok(`la respuesta de charla (${r}) no menciona un mail`, !t.includes("@"));
  ok(`la respuesta de charla (${r}) pasa la validación`, validateAssistantAnswer(t).ok);
}
ok(
  "la derivación por incidencia manda al botón, no al mail",
  !incidentDeflection("/admin/leads").includes("@") &&
    /bot[oó]n/i.test(incidentDeflection("/admin/leads")),
);
ok(
  "la derivación por facturación tampoco da el mail",
  !billingDeflection().includes("@"),
);

// ===========================================================================
console.log("\n— Helpers de herramientas —");

check(
  "extrae el término de búsqueda",
  searchTermOf("buscame el lead de Pérez"),
  "Pérez",
);
check(
  "id de lead desde la URL del vendedor",
  leadIdFromRoute("/sales/leads/8f2a1b4c-1111-2222-3333-444455556666"),
  "8f2a1b4c-1111-2222-3333-444455556666",
);
check(
  "id de lead desde la URL del admin",
  leadIdFromRoute("/admin/leads/8f2a1b4c-1111-2222-3333-444455556666/quote"),
  "8f2a1b4c-1111-2222-3333-444455556666",
);
check("sin id en el listado", leadIdFromRoute("/sales/leads"), null);

// ===========================================================================
console.log("\n— Navegación (determinista) —");

function fakeProfile(over: Partial<Profile> = {}): Profile {
  return {
    id: "u1",
    role: "sales",
    first_name: "Martín",
    last_name: "Sosa",
    company_id: "c1",
    branch_id: "b1",
    manager_id: "m1",
    can_export_leads: false,
    status: "active",
    ...over,
  } as Profile;
}

function fakeCtx(over: Partial<AssistantContext> = {}): AssistantContext {
  const profile = over.profile ?? fakeProfile();
  const base: CapsuleInput = {
    profile,
    role: profile.role,
    displayName: "Martín Sosa",
    companyName: "Salvador Concesionarios",
    plan: "estandar",
    branchName: "Quilmes",
    productTypes: ["0km", "Usados"],
    managerName: "Laura Gómez",
    features: ["inbox", "cotizador"],
    route: null,
    timezone: "America/Argentina/Buenos_Aires",
    ...over,
  };
  return { ...base, capsule: renderCapsule(base, null), scopeKey: scopeKeyOf(base) };
}

async function navTests() {
  const vendedor = fakeCtx();
  const r1 = await dondeEsta.run("¿dónde están mis ventas?", vendedor);
  ok("al vendedor lo manda a /sales/sales", r1.data.includes("/sales/sales"), r1.data);

  const r2 = await dondeEsta.run("dónde configuro el bot", vendedor);
  ok(
    "una pantalla de admin le dice a quién pedírsela",
    r2.data.includes("no está en tu menú"),
    r2.data,
  );

  const admin = fakeCtx({
    profile: fakeProfile({ role: "admin" }),
    role: "admin",
  });
  const r3 = await dondeEsta.run("dónde configuro el bot", admin);
  ok("al admin lo manda a /admin/bot", r3.data.includes("/admin/bot"), r3.data);

  const r4 = await dondeEsta.run("dónde está el zapallo", vendedor);
  ok("sin match, lo dice", r4.data.includes("No encontré"), r4.data);
  ok("navegación nunca llama al modelo", r1.direct === true && r4.direct === true);
}

// ===========================================================================
async function permisoTests() {
  console.log("\n— Permisos (determinista) —");

  const vendedor = fakeCtx();
  const r1 = await porQueNoVeo.run("por qué no puedo aprobar una venta", vendedor);
  ok(
    "al vendedor le dice quién aprueba",
    /gerente/i.test(r1.data),
    r1.data,
  );
  ok("permisos nunca llama al modelo", r1.direct === true);

  const r2 = await porQueNoVeo.run("por qué no veo los reportes", vendedor);
  ok("el vendedor SÍ ve reportes: explica el alcance", /sí, podés/i.test(r2.data), r2.data);

  const r3 = await porQueNoVeo.run("por qué no puedo", vendedor);
  ok("sin entidad, pregunta cuál", /Decime qué es/i.test(r3.data), r3.data);
}

// ===========================================================================
async function capsuleTests() {
  console.log("\n— La cápsula de contexto —");

  const ctx = fakeCtx({ route: "/sales/leads/abc" });
  // Sin la fecha, el modelo no puede resolver "mañana" ni "esta semana": lo que
  // hace en su lugar es inventar una.
  ok(
    "empieza diciendo qué día es hoy",
    /^Hoy es \w+/.test(ctx.capsule),
    ctx.capsule.split("\n")[0],
  );
  ok("nombra al usuario y su rol", ctx.capsule.includes("Martín Sosa · Vendedor"));
  ok("nombra la empresa y el plan", ctx.capsule.includes("Salvador Concesionarios"));
  ok("nombra la sucursal", ctx.capsule.includes("Quilmes"));
  ok("nombra al gerente", ctx.capsule.includes("Laura Gómez"));
  ok("dice qué NO puede", /No puede:/.test(ctx.capsule));
  ok("dice qué módulos faltan", /Sin activar/.test(ctx.capsule));
  ok("incluye la pantalla actual", ctx.capsule.includes("/sales/leads/abc"));

  // El presupuesto de la cápsula es de ~150 tokens: si se va de eso, se le está
  // comiendo el contexto a los fragmentos que efectivamente contestan.
  const approxTokens = Math.ceil(ctx.capsule.length / 3.6);
  ok(
    `la cápsula entra en el presupuesto (${approxTokens} tokens aprox.)`,
    approxTokens < 300,
    ctx.capsule,
  );
}

// ===========================================================================
// Golden set de recuperación. Necesita la base indexada.
// ===========================================================================

/** [pregunta, slug del artículo que TIENE que aparecer en el top 5, rol] */
const GOLDEN: [string, string, Profile["role"]][] = [
  ["¿cómo se reparten los leads entre los vendedores?", "sistema-y-reglas", "manager"],
  ["si un cliente vuelve a consultar, ¿le toca el mismo vendedor?", "sistema-y-reglas", "sales"],
  ["¿qué pasa con un lead sin sucursal?", "sistema-y-reglas", "admin"],
  ["¿cuándo pasa un lead a Presupuestado?", "estados-lead-venta", "sales"],
  ["¿qué significa la temperatura de un lead?", "estados-lead-venta", "sales"],
  ["¿qué reportes puedo mirar?", "reportes-disponibles", "admin"],
  ["¿qué variables puedo usar en una plantilla?", "variables-plantillas", "sales"],
  ["¿de dónde saca el precio el cotizador de usados?", "cotizador-usados", "admin"],
  ["¿el bot puede hablar de precios?", "respuesta-automatica", "admin"],
  ["¿cómo configuro la respuesta automática?", "respuesta-automatica", "admin"],
  ["¿cómo cambio de marca en un grupo?", "grupos-multimarca", "admin"],
  ["¿qué canales de origen hay para una campaña?", "campanas-origenes", "admin"],
  ["¿qué puedo hacer siendo vendedor?", "permisos-sales", "sales"],
  ["¿qué prioridades tiene una tarea?", "tareas-visitas-actividades", "sales"],
  ["¿cómo importo una base de leads?", "sistema-y-reglas", "admin"],
  ["¿quién aprueba una venta?", "estados-lead-venta", "sales"],
  ["¿qué es una gerencia?", "permisos-manager", "manager"],
  ["¿cómo invito a un vendedor?", "sistema-y-reglas", "manager"],
  ["¿qué pasa si un lead entra dos veces?", "sistema-y-reglas", "admin"],
];

/** Preguntas que TIENEN que dar "no sé": no existen en el CRM. */
const MUST_NOT_KNOW = [
  "¿cómo emito una factura electrónica de AFIP?",
  "¿cómo conecto el CRM con SAP?",
  "¿cuál es la temperatura en Córdoba?",
  "¿cómo cargo el stock de repuestos?",
  "¿dónde veo el libro de sueldos?",
  "¿cuánto está el dólar hoy?",
  "¿cómo hago un asiento contable?",
  "receta de milanesas",
  "¿cómo pido vacaciones?",
  "¿el CRM tiene app para reloj inteligente?",
];

async function retrievalTests() {
  const hasDb =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasAi = Boolean(process.env.OPENAI_API_KEY);

  if (!hasDb || !hasAi) {
    console.log(
      "\n— Golden set de recuperación —\n" +
        `  ⚠ Se saltea (falta ${!hasDb ? "Supabase" : ""}${!hasDb && !hasAi ? " y " : ""}${!hasAi ? "OPENAI_API_KEY" : ""}).\n` +
        "    Con .env.local completo y la base indexada (pnpm kb:build && pnpm kb:sync)\n" +
        `    corre ${GOLDEN.length} preguntas de oro y ${MUST_NOT_KNOW.length} que tienen que dar «no sé».`,
    );
    return;
  }

  console.log("\n— Golden set de recuperación —");

  const { embedOne, toPgVector } = await import("@/lib/ai/embed");
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { MIN_SIMILARITY } = await import("@/lib/assistant/retrieve");

  let hits = 0;
  for (const [question, slug, role] of GOLDEN) {
    const emb = await embedOne(question);
    if (!emb.ok) {
      failed++;
      console.log(`✗ ${question}: ${emb.reason}`);
      continue;
    }
    const { data, error } = await admin.rpc("match_kb", {
      query_embedding: toPgVector(emb.vector),
      query_text: question,
      p_role: role,
      p_plan: null,
      p_features: ["inbox", "bot", "cotizador", "sheets", "ads", "forms"],
      p_route: null,
      match_count: 5,
    });
    if (error) {
      failed++;
      console.log(`✗ ${question}: ${error.message}`);
      continue;
    }
    const slugs = ((data ?? []) as { slug: string }[]).map((r) => r.slug);
    const found = slugs.includes(slug);
    if (found) hits++;
    console.log(
      `${found ? "✓" : "✗"} "${question}"\n    esperaba ${slug} · top5: ${slugs.join(", ") || "(vacío)"}`,
    );
    if (!found) failed++;
  }
  const recall = Math.round((hits / GOLDEN.length) * 100);
  ok(`recall@5 = ${recall}% (objetivo ≥ 90%)`, recall >= 90);

  let quiet = 0;
  for (const question of MUST_NOT_KNOW) {
    const emb = await embedOne(question);
    if (!emb.ok) continue;
    const { data } = await admin.rpc("match_kb", {
      query_embedding: toPgVector(emb.vector),
      query_text: question,
      p_role: "sales",
      p_plan: null,
      p_features: ["inbox", "bot", "cotizador", "sheets", "ads", "forms"],
      p_route: null,
      match_count: 5,
    });
    const rows = (data ?? []) as { similarity: number; text_rank: number | null }[];
    const relevant = rows.filter(
      (r) => r.similarity >= MIN_SIMILARITY || (r.text_rank !== null && r.text_rank <= 3),
    );
    const silent = relevant.length === 0;
    if (silent) quiet++;
    console.log(
      `${silent ? "✓" : "✗"} no sabe: "${question}"` +
        (silent ? "" : `  (recuperó ${relevant.length}, sim ${relevant[0]?.similarity.toFixed(2)})`),
    );
    if (!silent) failed++;
  }
  console.log(`  ${quiet}/${MUST_NOT_KNOW.length} respondieron «no sé» como corresponde.`);
}

// ===========================================================================
async function main() {
  await navTests();
  await permisoTests();
  await capsuleTests();
  await retrievalTests();

  console.log(failed === 0 ? "\nTodo bien.\n" : `\n${failed} test(s) fallaron.\n`);
  if (failed > 0) process.exit(1);
}

void main();
