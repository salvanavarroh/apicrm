// ============================================================================
// dondeEsta — en qué pantalla se hace algo. Determinista, sin modelo.
//
// La fuente es `src/lib/nav.ts`, el mismo dato que pinta el menú. Por eso el
// asistente no puede mandar a un vendedor a una ruta de admin: si el ítem no
// está en SU menú, la respuesta dice quién sí lo tiene.
// ============================================================================

import type { UserRole } from "@/lib/auth";
import { normalize } from "@/lib/bot/guardrails";
import type { AssistantContext } from "@/lib/assistant/context";
import {
  COMMON_NAV,
  flatNav,
  navForRole,
  ROLE_LABELS,
  type NavItem,
} from "@/lib/nav";
import { type Tool, type ToolResult } from "@/lib/assistant/tools/types";

const OTHER_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "manager",
  "supervisor",
  "sales",
  "data_provider",
];

/** Palabras que no aportan al match. */
const STOP = new Set([
  "donde","esta","estan","encuentro","veo","configuro","como","llego","a","el","la",
  "los","las","de","del","en","que","pantalla","seccion","parte","se","hace","puedo",
  "para","un","una","mi","mis","y","o",
]);

function tokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Cuántos tokens de la pregunta aparecen en la etiqueta o en la pista. */
function score(item: NavItem, qTokens: string[]): number {
  const hay = normalize(`${item.label} ${item.hint ?? ""} ${item.href}`);
  let s = 0;
  for (const t of qTokens) if (hay.includes(t)) s += 1;
  // La etiqueta pesa más que la pista: "Ventas" tiene que ganarle a un hint que
  // menciona ventas de pasada.
  const label = normalize(item.label);
  for (const t of qTokens) if (label.includes(t)) s += 1;
  return s;
}

export const dondeEsta: Tool = {
  name: "dondeEsta",
  description: "Devuelve la ruta de la pantalla que el usuario busca, según su rol.",
  async run(question: string, ctx: AssistantContext): Promise<ToolResult> {
    const qTokens = tokens(question);
    const mine = [...flatNav(navForRole(ctx.role)), ...COMMON_NAV];

    // El umbral se adapta al largo de la pregunta. "¿Dónde configuro el bot?"
    // deja UN token útil después de sacar las palabras vacías: pedirle dos
    // coincidencias la dejaría sin respuesta siempre.
    const minScore = qTokens.length <= 1 ? 1 : 2;

    const ranked = mine
      .map((item) => ({ item, s: score(item, qTokens) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s);

    if (ranked.length > 0 && ranked[0].s >= minScore) {
      const best = ranked[0].item;
      const alts = ranked.slice(1, 3).filter((r) => r.s >= minScore);
      const lines = [
        `**${best.label}** → \`${best.href}\`${best.hint ? `\n\n${best.hint}.` : ""}`,
      ];
      if (alts.length > 0) {
        lines.push(
          "",
          "Si no era eso, puede ser: " +
            alts.map((a) => `**${a.item.label}** (\`${a.item.href}\`)`).join(" o ") +
            ".",
        );
      }
      return {
        data: lines.join("\n"),
        direct: true,
        links: [{ href: best.href, label: `Ir a ${best.label}` }],
        note: `match ${best.href}`,
      };
    }

    // No está en su menú: ¿está en el de otro rol?
    for (const role of OTHER_ROLES) {
      if (role === ctx.role) continue;
      const found = flatNav(navForRole(role))
        .map((item) => ({ item, s: score(item, qTokens) }))
        .filter((r) => r.s >= minScore)
        .sort((a, b) => b.s - a.s)[0];
      if (found) {
        return {
          data:
            `Esa pantalla no está en tu menú: **${found.item.label}** la maneja ` +
            `${ROLE_LABELS[role]}. Pedísela a quien tenga ese rol en tu concesionaria.`,
          direct: true,
          note: `fuera de alcance, es de ${role}`,
        };
      }
    }

    return {
      data:
        "No encontré una pantalla que coincida con eso en tu menú. " +
        "Probá nombrando la sección como aparece en el costado (por ejemplo «Leads», «Ventas», «Inbox»).",
      direct: true,
      note: "sin match",
    };
  },
};
