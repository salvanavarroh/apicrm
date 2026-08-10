/**
 * Test de las reglas de Next Best Action.
 * Sin framework, igual que `test-phone`: corre con `pnpm test:nba`.
 * Sale con código != 0 si falla.
 *
 * El reloj se inyecta (`nextBestAction(input, now)`) para que los casos sean
 * deterministas y no dependan de cuándo se corran.
 */
import {
  nextBestAction,
  type NbaInput,
  type NbaKind,
} from "@/lib/next-best-action";
import type { LeadStatus, LeadTemperature } from "@/lib/leads";

const NOW = new Date("2026-08-10T12:00:00.000Z").getTime();
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** ISO de "hace N horas" respecto del reloj fijo del test. */
const hoursAgo = (h: number) => new Date(NOW - h * HOUR).toISOString();
const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();
const daysAhead = (d: number) => new Date(NOW + d * DAY).toISOString();

function lead(over: {
  status: LeadStatus;
  temperature?: LeadTemperature | null;
  created_at?: string;
  status_changed_at?: string;
  last_contacted_at?: string | null;
  assigned_user_id?: string | null;
}): NbaInput["lead"] {
  return {
    status: over.status,
    // `?? "warm"` colapsaría un `null` explícito, que es justo lo que testeamos.
    temperature: over.temperature === undefined ? "warm" : over.temperature,
    created_at: over.created_at ?? daysAgo(1),
    status_changed_at: over.status_changed_at ?? hoursAgo(1),
    last_contacted_at: over.last_contacted_at ?? hoursAgo(1),
    assigned_user_id:
      over.assigned_user_id === undefined ? "vendor-1" : over.assigned_user_id,
  };
}

type Case = {
  name: string;
  input: NbaInput;
  expectKind: NbaKind | null;
  expectUrgency?: "now" | "today" | "soon" | "none";
};

const cases: Case[] = [
  {
    name: "venta cerrada → no sugiere nada",
    input: { lead: lead({ status: "accepted" }) },
    expectKind: null,
  },
  {
    name: "venta en evaluación gana sobre todo lo demás",
    input: {
      lead: lead({ status: "quoted" }),
      activeSaleStatus: "evaluating",
      tasks: [{ title: "Llamar", due_date: daysAgo(3), completed_at: null }],
    },
    expectKind: "sale",
    expectUrgency: "today",
  },
  {
    name: "tarea vencida antes que cualquier seguimiento",
    input: {
      lead: lead({ status: "contacted", last_contacted_at: daysAgo(10) }),
      tasks: [{ title: "Llamar", due_date: daysAgo(2), completed_at: null }],
    },
    expectKind: "task",
    expectUrgency: "now",
  },
  {
    name: "tarea completada no dispara alerta",
    input: {
      lead: lead({ status: "contacted" }),
      tasks: [
        { title: "Llamar", due_date: daysAgo(2), completed_at: daysAgo(2) },
      ],
      visits: [{ scheduled_at: daysAhead(5), status: "scheduled" }],
    },
    expectKind: "wait",
    expectUrgency: "none",
  },
  {
    name: "visita en menos de 24h → confirmar ahora",
    input: {
      lead: lead({ status: "interested" }),
      visits: [{ scheduled_at: new Date(NOW + 6 * HOUR).toISOString(), status: "scheduled" }],
      quotes: [{ created_at: daysAgo(1), sent_at: daysAgo(1) }],
    },
    expectKind: "visit",
    expectUrgency: "now",
  },
  {
    name: "visita agendada que ya pasó y sigue 'scheduled' → registrar resultado",
    input: {
      lead: lead({ status: "interested" }),
      visits: [{ scheduled_at: daysAgo(2), status: "scheduled" }],
      quotes: [{ created_at: daysAgo(3), sent_at: daysAgo(3) }],
    },
    expectKind: "visit",
    expectUrgency: "now",
  },
  {
    name: "lead nuevo sin asignar → asignar",
    input: { lead: lead({ status: "new", assigned_user_id: null }) },
    expectKind: "task",
    expectUrgency: "now",
  },
  {
    name: "lead nuevo asignado hace 1h → primer contacto hoy",
    input: { lead: lead({ status: "new", created_at: hoursAgo(1) }) },
    expectKind: "call",
    expectUrgency: "today",
  },
  {
    name: "lead nuevo de hace 2 días → primer contacto YA",
    input: { lead: lead({ status: "new", created_at: daysAgo(2) }) },
    expectKind: "call",
    expectUrgency: "now",
  },
  {
    name: "interesado sin presupuesto → generar presupuesto",
    input: { lead: lead({ status: "interested" }), quotes: [] },
    expectKind: "quote",
    expectUrgency: "today",
  },
  {
    name: "presupuestado hace 6 días sin respuesta → pedir definición YA",
    input: {
      lead: lead({ status: "quoted" }),
      quotes: [{ created_at: daysAgo(6), sent_at: daysAgo(6) }],
    },
    expectKind: "follow_up",
    expectUrgency: "now",
  },
  {
    name: "presupuestado ayer → todavía no se lo apura",
    input: {
      lead: lead({ status: "quoted" }),
      quotes: [{ created_at: daysAgo(1), sent_at: daysAgo(1) }],
      visits: [{ scheduled_at: daysAhead(3), status: "scheduled" }],
    },
    expectKind: "wait",
    expectUrgency: "none",
  },
  {
    name: "lead caliente frenado 4 días → recontactar YA",
    input: {
      lead: lead({
        status: "contacted",
        temperature: "hot",
        last_contacted_at: daysAgo(4),
      }),
    },
    expectKind: "follow_up",
    expectUrgency: "now",
  },
  {
    name: "lead tibio frenado 4 días → recontactar hoy",
    input: {
      lead: lead({
        status: "contacted",
        temperature: "warm",
        last_contacted_at: daysAgo(4),
      }),
    },
    expectKind: "follow_up",
    expectUrgency: "today",
  },
  {
    name: "contacto reciente pero sin temperatura → calificar",
    input: { lead: lead({ status: "contacted", temperature: null }) },
    expectKind: "qualify",
    expectUrgency: "soon",
  },
  {
    name: "calificado, contacto reciente y sin próximo paso → agendar",
    input: { lead: lead({ status: "contacted" }), tasks: [], visits: [] },
    expectKind: "task",
    expectUrgency: "soon",
  },
  {
    name: "no interesado reciente → nada por ahora",
    input: {
      lead: lead({ status: "not_interested", status_changed_at: daysAgo(10) }),
    },
    expectKind: "wait",
    expectUrgency: "none",
  },
  {
    name: "no interesado hace +60 días → reactivar",
    input: {
      lead: lead({ status: "not_interested", status_changed_at: daysAgo(70) }),
    },
    expectKind: "follow_up",
    expectUrgency: "soon",
  },
  {
    name: "venta rechazada → ofrecer alternativa",
    input: { lead: lead({ status: "rejected" }) },
    expectKind: "close",
    expectUrgency: "soon",
  },
];

let failed = 0;
for (const c of cases) {
  const got = nextBestAction(c.input, NOW);
  const kindOk = (got?.kind ?? null) === c.expectKind;
  const urgencyOk =
    c.expectUrgency === undefined || got?.urgency === c.expectUrgency;

  if (kindOk && urgencyOk) {
    console.log(`✓ ${c.name}`);
  } else {
    failed++;
    console.log(
      `✗ ${c.name}\n    esperaba kind=${c.expectKind}${
        c.expectUrgency ? ` urgency=${c.expectUrgency}` : ""
      }\n    obtuvo   kind=${got?.kind ?? "null"} urgency=${got?.urgency ?? "-"}` +
        (got ? `\n    título: ${got.title}` : ""),
    );
  }
}

console.log(
  failed === 0
    ? `\n${cases.length} casos OK`
    : `\n${failed} de ${cases.length} casos FALLARON`,
);
process.exit(failed === 0 ? 0 : 1);
