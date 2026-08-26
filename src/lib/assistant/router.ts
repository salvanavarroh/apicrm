// ============================================================================
// El ruteador: ¿qué clase de pregunta es ésta?
//
// Función PURA a propósito, igual que `bot/decide.ts`: toda la política vive
// acá, se testea sin infraestructura, y cuando alguien pregunta "¿por qué el
// asistente me contestó eso?" hay una regla con nombre para señalar.
//
// EL ORDEN DE LAS REGLAS ES LA POLÍTICA. La primera que matchea gana.
//
// No hay una llamada al modelo para clasificar, y es deliberado: sumaría 400 ms
// al presupuesto de latencia para resolver un problema que en castellano tiene
// marcadores léxicos fuertes ("cuántos", "por qué no veo", "dónde está"). Si
// ninguna regla matchea, cae en `producto`, que es la ruta segura: recupera de
// la base de conocimiento y, si no encuentra nada, dice que no sabe.
// ============================================================================

import { normalize } from "@/lib/bot/guardrails";

export type AssistantRoute =
  /** Permisos: "¿por qué no veo…?". Se contesta sin IA. */
  | "permisos"
  /** Datos en vivo: se ejecuta una herramienta con el cliente del usuario. */
  | "datos"
  /** Dónde está una pantalla. Se contesta sin IA, desde el menú. */
  | "navegacion"
  /** Conocimiento del producto: recuperación + generación. */
  | "producto"
  /** Se deriva a una persona. */
  | "soporte";

export type ToolName =
  | "misNumeros"
  | "buscarLead"
  | "misTareas"
  | "estadoDeVenta"
  | "miEquipo"
  | "queHacerCon";

export type RouteDecision = {
  route: AssistantRoute;
  tool?: ToolName;
  /** Nombre de la regla que decidió. Se loguea. */
  reason: string;
};

type Rule = {
  name: string;
  route: AssistantRoute;
  tool?: ToolName;
  test: RegExp;
  /** Si matchea esto, la regla NO aplica. Evita falsos positivos conocidos. */
  unless?: RegExp;
};

// ---------------------------------------------------------------------------
// Reglas, en orden de prioridad.
//
// Los patrones se evalúan sobre el texto NORMALIZADO (sin acentos, sin
// puntuación, minúsculas), así que van escritos sin tildes.
// ---------------------------------------------------------------------------
export const ROUTER_RULES: Rule[] = [
  // 1. Navegación. VA PRIMERO. "¿Dónde está X?" es intención de navegación sea
  //    cual sea X: si no estuviera acá arriba, "¿dónde está la facturación?" lo
  //    agarraría la regla de plata de la §2 y derivaría a soporte en vez de dar
  //    la ruta de una pantalla que el usuario tiene en su propio menú.
  {
    name: "navegacion",
    route: "navegacion",
    test: /\b(donde (esta|estan|encuentro|veo|configuro|se configura|se carga|se cambia)|como llego a|en que (pantalla|seccion|parte)|que seccion|en donde)\b/,
  },

  // 2. Permisos. Antes que las incidencias porque "no me deja" y "no puedo"
  //    también aparecen en reportes de bug, y el explicador sabe derivar a
  //    soporte cuando el usuario SÍ tiene el permiso. El error barato es éste.
  {
    name: "permisos",
    route: "permisos",
    test: /\b(por que no (veo|puedo|me deja|aparece)|no me aparece|no puedo (ver|editar|entrar|acceder|asignar|aprobar|exportar|descargar|crear|borrar)|no tengo (acceso|permiso)|no me deja|me falta permiso|quien puede|puedo (ver|editar|aprobar|asignar|exportar|borrar|crear))\b/,
  },

  // 3. Plata de la plataforma. Se deriva siempre: el asistente no habla de
  //    facturación, precios ni mora de la suscripción. Es la misma política que
  //    el bot del inbox, por el mismo motivo.
  //    `unless` evita el falso positivo grande: "plan de ahorro" es un tipo de
  //    producto del negocio, no el plan de suscripción.
  {
    name: "facturacion-plataforma",
    route: "soporte",
    test: /\b(cuanto (pagamos|cuesta|sale|nos sale)|factura|facturacion|suscripcion|abono|mensualidad|mora|moroso|vencimiento del plan|cambiar de plan|precio del sistema|precio del crm)\b/,
    unless: /\bplan(es)? de ahorro\b/,
  },

  // 4. Incidencias. Algo no funciona: no es una duda, es un bug.
  {
    name: "incidencia",
    route: "soporte",
    test: /\b(no (anda|funciona|carga|abre|responde|se ve|aparece nada)|esta (roto|caido)|se (me |le |nos )?(rompio|rompe|colgo|cuelga|cae|cayo|traba|trabo)|da error|tira error|error \d|(sale|salio|queda|quedo|aparece|esta) en blanco|pantalla en blanco|no me llega el mail|no llego el mail|se cerro solo)\b/,
  },

  // 5. Datos en vivo. Cada regla nombra la herramienta que la resuelve.
  {
    name: "datos-equipo",
    route: "datos",
    tool: "miEquipo",
    test: /\b(mi equipo|mis vendedores|el equipo|quien tiene mas|quien esta mas cargado|carga del equipo|como viene el equipo|reparto de leads)\b/,
  },
  {
    name: "datos-tareas",
    route: "datos",
    tool: "misTareas",
    test: /\b((mis|que) (tareas|visitas)|tengo (tareas|visitas|algo) (hoy|manana|pendiente)|agenda de hoy|que tengo (hoy|manana)|pendientes de hoy|vencidas)\b/,
  },
  {
    name: "datos-venta",
    route: "datos",
    tool: "estadoDeVenta",
    test: /\b(estado de (la|mi) venta|mi venta|mis ventas|me aprobaron|ya aprobaron|venta pendiente|ventas pendientes|falta aprobar)\b/,
  },
  {
    name: "datos-lead-puntual",
    route: "datos",
    tool: "buscarLead",
    test: /\b(busca(r|me)?|encontra(r|me)?|dame|mostrame|abrime) (el |la |un |una )?(lead|cliente|contacto|ficha)\b|\b(lead|cliente) (de|llamado|con (telefono|mail|email|dni))\b/,
  },
  {
    name: "datos-siguiente-accion",
    route: "datos",
    tool: "queHacerCon",
    test: /\b(que (hago|le digo|hacemos) con|proxima accion|siguiente paso|como sigo con)\b/,
  },
  {
    name: "datos-numeros",
    route: "datos",
    tool: "misNumeros",
    test: /\b(cuantos|cuantas|cuanto (vendi|vendimos|lleve|llevamos|facture|facturamos)|mis numeros|como (voy|vamos|vengo)|conversion|tasa de|sin contactar|sin asignar|leads nuevos|del mes|este mes|ranking)\b/,
  },
];

/**
 * Clasifica la pregunta.
 *
 * Devuelve siempre algo: la ruta por default es `producto`.
 */
export function routeQuestion(text: string): RouteDecision {
  const t = normalize(text);

  for (const rule of ROUTER_RULES) {
    if (!rule.test.test(t)) continue;
    if (rule.unless?.test(t)) continue;
    return { route: rule.route, tool: rule.tool, reason: rule.name };
  }

  return { route: "producto", reason: "default" };
}

/**
 * Entidad mencionada en una pregunta de permisos, si se puede inferir.
 *
 * Sirve para que `porQueNoVeo` sepa de qué está hablando el usuario sin pedirle
 * que lo aclare.
 */
export type MentionedEntity =
  | "lead"
  | "venta"
  | "reporte"
  | "usuario"
  | "inbox"
  | "campaña"
  | "precio"
  | "sucursal"
  | null;

export function mentionedEntity(text: string): MentionedEntity {
  const t = normalize(text);
  if (/\blead|leads|cliente|contacto|ficha\b/.test(t)) return "lead";
  if (/\bventa|ventas|cierre\b/.test(t)) return "venta";
  if (/\breporte|reportes|informe|metrica|dashboard\b/.test(t)) return "reporte";
  if (/\busuario|usuarios|vendedor|gerente|equipo|invitar\b/.test(t)) return "usuario";
  if (/\binbox|conversacion|whatsapp|mensaje\b/.test(t)) return "inbox";
  if (/\bcampana|campanas\b/.test(t)) return "campaña";
  if (/\bprecio|precios|lista de precios\b/.test(t)) return "precio";
  if (/\bsucursal|sucursales\b/.test(t)) return "sucursal";
  return null;
}

// ---------------------------------------------------------------------------
// Qué capacidad está preguntando el usuario.
//
// La entidad sola no alcanza: "¿por qué no puedo APROBAR una venta?" y "¿por qué
// no VEO una venta?" mencionan lo mismo y son dos permisos distintos. El VERBO
// manda, y la entidad desempata.
// ---------------------------------------------------------------------------

/** Los nombres coinciden con las claves de `Capability` en lib/permissions. */
type CapabilityName = string;

type VerbRule = {
  name: string;
  verb: RegExp;
  /** Si está, la entidad tiene que coincidir para que la regla aplique. */
  entity?: MentionedEntity;
  capability: CapabilityName;
};

const VERB_RULES: VerbRule[] = [
  { name: "aprobar-venta", verb: /\b(aprobar|rechazar|validar|autorizar)\b/, capability: "sales:approve" },
  { name: "iniciar-venta", verb: /\b(iniciar|registrar|arrancar) (una |la )?venta\b/, capability: "sales:start" },
  { name: "exportar", verb: /\b(exportar|descargar|bajar|extraer)\b/, capability: "leads:export" },
  { name: "importar", verb: /\b(importar|subir|cargar) (una |la |el )?(base|csv|excel|archivo|planilla|padron)\b/, capability: "leads:import" },
  { name: "asignar", verb: /\b(asignar|reasignar|repartir|distribuir|pasar) \w*\s?(lead|leads)?\b/, entity: "lead", capability: "leads:assign" },
  { name: "borrar-lead", verb: /\b(borrar|eliminar)\b/, entity: "lead", capability: "leads:delete" },
  { name: "editar-lead", verb: /\b(editar|modificar|cambiar|corregir)\b/, entity: "lead", capability: "leads:edit" },
  { name: "cotizar", verb: /\b(presupuest\w+|cotizar|cotizacion)\b/, capability: "quotes:create" },
  { name: "crear-usuario", verb: /\b(crear|invitar|dar de alta|sumar|agregar)\b/, entity: "usuario", capability: "users:manage_sellers" },
  { name: "configurar-bot", verb: /\b(configurar|prender|activar|apagar)\b/, entity: "inbox", capability: "bot:configure" },
  { name: "editar-precios", verb: /\b(editar|cargar|actualizar|cambiar|subir)\b/, entity: "precio", capability: "prices:manage" },
  { name: "crear-campana", verb: /\b(crear|editar|armar)\b/, entity: "campaña", capability: "campaigns:manage" },
  { name: "crear-sucursal", verb: /\b(crear|pedir|solicitar|agregar)\b/, entity: "sucursal", capability: "branches:manage" },
];

/** Capacidad por entidad, cuando no hay un verbo que la precise. */
const CAP_BY_ENTITY: Record<Exclude<MentionedEntity, null>, CapabilityName> = {
  lead: "leads:view",
  venta: "sales:view",
  reporte: "reports:view",
  usuario: "users:manage_sellers",
  inbox: "inbox:use",
  campaña: "campaigns:manage",
  precio: "prices:view",
  sucursal: "branches:manage",
};

/**
 * La capacidad sobre la que se está preguntando, o null si no se puede inferir.
 */
export function intendedCapability(text: string): CapabilityName | null {
  const t = normalize(text);
  const entity = mentionedEntity(text);

  for (const rule of VERB_RULES) {
    if (rule.entity && rule.entity !== entity) continue;
    if (rule.verb.test(t)) return rule.capability;
  }

  return entity ? CAP_BY_ENTITY[entity] : null;
}
