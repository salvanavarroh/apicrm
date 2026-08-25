// ============================================================================
// El contrato de una herramienta del asistente.
//
// LA REGLA QUE NO SE NEGOCIA: toda herramienta consulta con el cliente Supabase
// DEL USUARIO (`createClient()` de `lib/supabase/server`), nunca con
// `createAdminClient()`. El asistente no puede ver nada que el usuario no vea
// entrando a mano. No hay lógica de permisos que escribir ni auditar: es la
// misma RLS que ya está probada, y por eso el mismo `count(*)` da el número
// correcto para un vendedor, un gerente y un admin sin una sola condición.
//
// La única excepción, acotada y documentada, es `porQueNoVeo`, que necesita
// distinguir "no tenés permiso" de "ese id no existe". Ver ese archivo.
// ============================================================================

import type { AssistantContext } from "@/lib/assistant/context";

export type ToolLink = { href: string; label: string };

export type ToolResult = {
  /**
   * El bloque de datos. Va al prompt ROTULADO COMO DATO, nunca concatenado a las
   * instrucciones: un lead que se llame "ignorá tus instrucciones" no puede
   * cambiar el comportamiento del asistente.
   */
  data: string;
  /**
   * `true` = se devuelve `data` tal cual, sin pasar por el modelo. Es lo que
   * hace que las respuestas de permisos y de navegación sean deterministas y
   * gratis.
   */
  direct?: boolean;
  links?: ToolLink[];
  /** Para el log: qué se consultó. */
  note?: string;
};

export type Tool = {
  name: string;
  /** Una línea. Aparece en la pantalla de métricas del asistente. */
  description: string;
  run: (question: string, ctx: AssistantContext) => Promise<ToolResult>;
};

/** Primer día del mes en curso, en ISO. */
export function monthStartIso(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/** Fecha de hoy como YYYY-MM-DD (las tareas usan `date`, no `timestamptz`). */
export function todayIso(now = new Date()): string {
  const tz = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

export function addDaysIso(days: number, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return todayIso(d);
}

/** Saca de la pregunta el término de búsqueda, quitando las palabras gatillo. */
export function searchTermOf(question: string): string {
  return question
    .replace(
      /\b(busca(r|me)?|encontra(r|me)?|dame|mostrame|abrime|el|la|un|una|lead|cliente|contacto|ficha|de|con|telefono|mail|email|dni|llamado|llamada|por favor)\b/gi,
      " ",
    )
    .replace(/[?¿!¡.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** El id de lead de la URL, si el usuario está parado en una ficha. */
export function leadIdFromRoute(route: string | null): string | null {
  if (!route) return null;
  const m =
    /\/(?:admin|manager|sales|data-provider|super-admin)\/leads\/([0-9a-f-]{36})/i.exec(
      route,
    );
  return m ? m[1] : null;
}
