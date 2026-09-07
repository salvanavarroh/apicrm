// ============================================================================
// Reparto de leads por formulario de Meta Lead Ads.
//
// Vive fuera de `lead-ads/actions.ts` porque ese módulo es `"use server"` y sólo
// puede exportar funciones async: las etiquetas de los modos las necesitan el
// diálogo (cliente) y la lista de formularios (server), así que van acá.
//
// El criterio de cada modo lo aplica `assign_lead_from_form` en la base
// (migración `20260907120000_lead_ad_form_assignment`).
// ============================================================================

export type AssignmentMode = "auto" | "round_robin" | "fixed" | "pool";

export const ASSIGNMENT_MODES: {
  value: AssignmentMode;
  label: string;
  /** Etiqueta corta para el chip de la lista. */
  short: string;
  hint: string;
}[] = [
  {
    value: "auto",
    label: "Automático (por gerencia y carga)",
    short: "Automático",
    hint: "Al vendedor con menos leads abiertos de la gerencia (sucursal + tipo). Necesita la asignación automática prendida en Gerencias.",
  },
  {
    value: "round_robin",
    label: "Round-robin entre vendedores elegidos",
    short: "Round-robin",
    hint: "Por turno, uno tras otro, entre los vendedores que elijas. No mira la carga de cada uno: reparte parejo y previsible.",
  },
  {
    value: "fixed",
    label: "Siempre al mismo vendedor",
    short: "Vendedor fijo",
    hint: "Todos los leads del formulario van a un vendedor.",
  },
  {
    value: "pool",
    label: "Dejar sin asignar (pool)",
    short: "Pool",
    hint: "El lead queda sin dueño en el pool y lo toma el primero que lo agarre.",
  },
];

export function assignmentModeMeta(mode: AssignmentMode) {
  return ASSIGNMENT_MODES.find((m) => m.value === mode) ?? ASSIGNMENT_MODES[0];
}

export type VendorOption = { id: string; name: string; branch: string | null };
