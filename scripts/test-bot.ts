/**
 * Tests de la lógica pura del bot del inbox: guardrails, clasificador por
 * palabras clave y máquina de decisión.
 *
 * Sin framework, igual que `test-phone` y `test-nba`: `pnpm test:bot`.
 * No toca la base ni la red — el LLM y Supabase quedan fuera a propósito.
 */
import { classifyByKeyword, type IntentCandidate } from "@/lib/bot/classify";
import { decide, type BotConfig, type BotSituation } from "@/lib/bot/decide";
import { checkGuardrails } from "@/lib/bot/guardrails";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`✓ ${name}`);
  else {
    failed++;
    console.log(`✗ ${name}\n    esperaba ${JSON.stringify(want)}\n    obtuvo   ${JSON.stringify(got)}`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n— Guardrails —");

check(
  "pedir un asesor fuerza el handoff",
  checkGuardrails("hola, me pasás con un asesor?").kind,
  "handoff",
);
check(
  "pedir hablar con una persona también",
  checkGuardrails("quiero hablar con alguien real").kind,
  "handoff",
);
check(
  "preguntar por descuento queda bloqueado",
  checkGuardrails("me hacés algún descuento?").kind,
  "blocked",
);
check(
  "la seña queda bloqueada (con y sin ñ)",
  [checkGuardrails("cuánto es la seña?").kind, checkGuardrails("cuanto es la senia").kind],
  ["blocked", "blocked"],
);
check(
  "la tasa queda bloqueada",
  checkGuardrails("qué TNA tiene el crédito").kind,
  "blocked",
);
check(
  "una pregunta inocente pasa",
  checkGuardrails("atienden los sábados?").kind,
  "ok",
);
check(
  "el handoff gana sobre el bloqueo si pide las dos cosas",
  checkGuardrails("quiero un descuento, pasame un asesor").kind,
  "handoff",
);

// ---------------------------------------------------------------------------
console.log("\n— Clasificador por palabras clave —");

const INTENTS: IntentCandidate[] = [
  { slug: "saludo", label: "Saludo", keywords: ["hola", "buenas"] },
  { slug: "horarios", label: "Horarios", keywords: ["horario", "atienden", "sabado"] },
  { slug: "modelos", label: "Modelos", keywords: ["tienen", "stock", "0km"] },
  { slug: "usado", label: "Usado", keywords: ["usado", "parte de pago"] },
];

check(
  "match simple",
  classifyByKeyword("hola!", INTENTS),
  { slug: "saludo", matchedBy: "keyword" },
);
check(
  "match sin acentos",
  classifyByKeyword("atienden el sábado?", INTENTS).slug,
  "horarios",
);
check(
  "gana la palabra clave más larga (más específica)",
  classifyByKeyword("tienen algo en parte de pago?", INTENTS).slug,
  "usado",
);
check(
  "sin match devuelve none para que decida el LLM",
  classifyByKeyword("me late el motor raro", INTENTS),
  { slug: null, matchedBy: "none" },
);
check(
  "sin intenciones cargadas no explota",
  classifyByKeyword("hola", []),
  { slug: null, matchedBy: "none" },
);

// ---------------------------------------------------------------------------
console.log("\n— Máquina de decisión —");

const base: BotConfig = {
  enabled: true,
  mode: "draft",
  outsideHours: true,
  whenNobodyActive: true,
  idleTriggerMinutes: null,
  maxTurns: 3,
};
const situation: BotSituation = {
  withinHours: true,
  someoneActive: true,
  minutesWaiting: 1,
  turnsUsed: 0,
  humanReplied: false,
  windowOpen: true,
};

check(
  "apagado no actúa",
  decide({ ...base, enabled: false }, situation),
  { act: false, reason: "bot apagado" },
);
check(
  "ventana de 24h cerrada no actúa (regla de Meta)",
  decide(base, { ...situation, windowOpen: false }),
  { act: false, reason: "ventana de 24h cerrada" },
);
check(
  "si ya contestó un humano no actúa nunca más",
  decide(base, { ...situation, humanReplied: true, withinHours: false }),
  { act: false, reason: "ya contestó un humano" },
);
check(
  "respeta el tope de turnos",
  decide(base, { ...situation, turnsUsed: 3, withinHours: false }),
  { act: false, reason: "tope de 3 respuestas alcanzado" },
);
check(
  "fuera de horario actúa",
  decide(base, { ...situation, withinHours: false }),
  { act: true, mode: "draft", trigger: "fuera de horario" },
);
check(
  "en horario sin nadie activo actúa",
  decide(base, { ...situation, someoneActive: false }),
  { act: true, mode: "draft", trigger: "sin asesores activos" },
);
check(
  "en horario con gente activa NO actúa si no hay disparador por demora",
  decide(base, situation),
  { act: false, reason: "ningún disparador aplica" },
);
check(
  "con disparador por demora actúa aunque haya gente activa (activo ≠ disponible)",
  decide(
    { ...base, idleTriggerMinutes: 7 },
    { ...situation, minutesWaiting: 9 },
  ),
  { act: true, mode: "draft", trigger: "9 min sin respuesta" },
);
check(
  "con disparador por demora pero poco tiempo, espera",
  decide(
    { ...base, idleTriggerMinutes: 7 },
    { ...situation, minutesWaiting: 3 },
  ),
  { act: false, reason: "ningún disparador aplica" },
);
check(
  "modo auto se propaga a la decisión",
  decide({ ...base, mode: "auto" }, { ...situation, withinHours: false }),
  { act: true, mode: "auto", trigger: "fuera de horario" },
);
check(
  "desactivar ambos disparadores deja al bot callado fuera de horario",
  decide(
    { ...base, outsideHours: false, whenNobodyActive: false },
    { ...situation, withinHours: false, someoneActive: false },
  ),
  { act: false, reason: "ningún disparador aplica" },
);

console.log(
  failed === 0 ? "\nTodos los casos OK" : `\n${failed} caso(s) FALLARON`,
);
process.exit(failed === 0 ? 0 : 1);
