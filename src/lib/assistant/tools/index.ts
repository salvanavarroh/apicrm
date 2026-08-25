// ============================================================================
// El catálogo de herramientas. CERRADO.
//
// Ocho funciones tipadas, ninguna genera SQL. Agregar una novena es una decisión
// que se toma acá, no un efecto colateral de cambiar un prompt. Esa es la
// diferencia entre esto y "un agente con acceso a la base".
// ============================================================================

import { buscarLead } from "@/lib/assistant/tools/buscar-lead";
import { dondeEsta } from "@/lib/assistant/tools/donde-esta";
import { estadoDeVenta } from "@/lib/assistant/tools/estado-venta";
import { miEquipo } from "@/lib/assistant/tools/mi-equipo";
import { misNumeros } from "@/lib/assistant/tools/mis-numeros";
import { misTareas } from "@/lib/assistant/tools/mis-tareas";
import { porQueNoVeo } from "@/lib/assistant/tools/por-que-no-veo";
import { queHacerCon } from "@/lib/assistant/tools/que-hacer-con";
import type { Tool } from "@/lib/assistant/tools/types";

export const TOOLS: Record<string, Tool> = {
  misNumeros,
  buscarLead,
  misTareas,
  estadoDeVenta,
  miEquipo,
  queHacerCon,
  dondeEsta,
  porQueNoVeo,
};

export function findTool(name: string): Tool | null {
  return TOOLS[name] ?? null;
}

export type { Tool, ToolResult, ToolLink } from "@/lib/assistant/tools/types";
