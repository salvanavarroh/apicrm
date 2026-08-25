// ============================================================================
// La cápsula de contexto: el TEXTO y sus tipos. Sin IO.
//
// Está separada de `context.ts` (que la carga desde la base) por la misma razón
// que `bot/decide.ts` está separado de `bot/respond.ts`: la política se testea
// sin infraestructura. `pnpm test:assistant` verifica acá que la cápsula diga
// quién es el usuario, qué no puede hacer y qué módulos le faltan, y que entre
// en su presupuesto de ~150 tokens.
// ============================================================================

import type { Profile, UserRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/nav";
import { describePermissions } from "@/lib/permissions";
import { planLabel } from "@/lib/plans";
import type { CompanyPlanEnum } from "@/types/assistant-db";

/** Módulos cuya disponibilidad cambia lo que tiene sentido explicar. */
export type FeatureKey =
  | "inbox"
  | "bot"
  | "cotizador"
  | "sheets"
  | "ads"
  | "forms";

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  inbox: "Inbox de WhatsApp",
  bot: "Respuesta automática",
  cotizador: "Cotizador de usados",
  sheets: "Google Sheets",
  ads: "Rendimiento de Ads",
  forms: "Formularios de captación",
};

export type AssistantContext = {
  profile: Profile;
  /** Rol efectivo: `group_admin` cuenta como `admin`. */
  role: UserRole;
  displayName: string;
  companyName: string | null;
  plan: CompanyPlanEnum | null;
  branchName: string | null;
  productTypes: string[];
  managerName: string | null;
  features: FeatureKey[];
  /** Pantalla donde está parado el usuario cuando pregunta. */
  route: string | null;
  /** El texto que va al prompt. */
  capsule: string;
  /** Clave de caché: dos usuarios con distinto alcance no comparten respuesta. */
  scopeKey: string;
};

export type CapsuleInput = Omit<AssistantContext, "capsule" | "scopeKey">;

/**
 * El texto de la cápsula.
 *
 * Corto a propósito: el presupuesto es de ~150 tokens y volcarle 38 capacidades
 * sería volver al prompt gigante que este diseño evita. Lo que entra es lo que
 * cambia la respuesta.
 */
export function renderCapsule(
  ctx: CapsuleInput,
  botMode: string | null,
): string {
  const perms = describePermissions(ctx.profile);
  const lines: string[] = [];

  lines.push(`Usuario: ${ctx.displayName} · ${ROLE_LABELS[ctx.role]}`);

  if (ctx.companyName) {
    lines.push(
      `Empresa: ${ctx.companyName}${ctx.plan ? ` (plan ${planLabel(ctx.plan)})` : ""}`,
    );
  } else if (ctx.role === "super_admin") {
    lines.push("Empresa: ninguna — es soporte de la plataforma, ve todas");
  }

  const scope: string[] = [];
  if (ctx.branchName) scope.push(`Sucursal: ${ctx.branchName}`);
  if (ctx.productTypes.length) {
    scope.push(`Tipos de producto: ${ctx.productTypes.join(", ")}`);
  }
  if (ctx.managerName) scope.push(`Reporta a: ${ctx.managerName}`);
  if (scope.length) lines.push(scope.join(" · "));

  lines.push(`Puede: ${perms.can.join("; ") || "nada"}`);
  lines.push(`No puede: ${perms.cannot.join(", ") || "nada, puede todo"}`);

  const mods = ctx.features.map((f) => FEATURE_LABELS[f]);
  const off = (Object.keys(FEATURE_LABELS) as FeatureKey[])
    .filter((f) => !ctx.features.includes(f))
    .map((f) => FEATURE_LABELS[f]);
  lines.push(
    `Módulos activos: ${mods.join(", ") || "ninguno"}` +
      (botMode
        ? ` (bot en modo ${botMode === "auto" ? "responder solo" : "sólo sugerir"})`
        : "") +
      (off.length ? ` · Sin activar: ${off.join(", ")}` : ""),
  );

  if (ctx.route) lines.push(`Pantalla actual: ${ctx.route}`);

  return lines.join("\n");
}

/** La clave de alcance para la caché semántica. */
export function scopeKeyOf(ctx: CapsuleInput): string {
  return `${ctx.role}|${ctx.plan ?? "-"}|${[...ctx.features].sort().join(",")}`;
}
