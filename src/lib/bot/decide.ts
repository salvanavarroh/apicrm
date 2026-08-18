// ============================================================================
// ¿Tiene que intervenir el bot en este mensaje?
//
// Función PURA a propósito: no toca la base ni la red. Toda la política vive
// acá, así que se puede testear sin infraestructura y el gerente puede recibir
// una respuesta concreta a "¿por qué el bot contestó/no contestó?".
//
// El orden de los cortes ES la política. Cada `no` tiene un motivo nombrado que
// después se loguea en bot_messages.
// ============================================================================

export type BotConfig = {
  enabled: boolean;
  mode: "draft" | "auto";
  outsideHours: boolean;
  whenNobodyActive: boolean;
  idleTriggerMinutes: number | null;
  maxTurns: number;
};

export type BotSituation = {
  /** La sucursal está dentro de su horario de atención. */
  withinHours: boolean;
  /** Hay al menos un vendedor con presencia activa y fresca. */
  someoneActive: boolean;
  /** Minutos desde el último mensaje del cliente sin respuesta humana. null = recién llegó. */
  minutesWaiting: number | null;
  /** Respuestas automáticas ya usadas en esta conversación. */
  turnsUsed: number;
  /** Un humano ya contestó en esta conversación. */
  humanReplied: boolean;
  /** La ventana de 24 h de Meta sigue abierta. */
  windowOpen: boolean;
};

export type BotDecision =
  | { act: false; reason: string }
  | { act: true; mode: "draft" | "auto"; trigger: string };

/**
 * Decide si el bot interviene, y en qué modo.
 *
 * `trigger` explica POR QUÉ intervino, para poder auditarlo.
 */
export function decide(
  config: BotConfig,
  s: BotSituation,
): BotDecision {
  if (!config.enabled) return { act: false, reason: "bot apagado" };

  // La ventana de 24 h es una regla de Meta, no una preferencia: fuera de ella
  // sólo se pueden mandar plantillas aprobadas, no texto libre.
  if (!s.windowOpen) {
    return { act: false, reason: "ventana de 24h cerrada" };
  }

  // Si un humano ya entró, el bot no vuelve a hablar en esta conversación.
  // Pisarle la respuesta a un vendedor es peor que no responder.
  if (s.humanReplied) {
    return { act: false, reason: "ya contestó un humano" };
  }

  if (s.turnsUsed >= config.maxTurns) {
    return { act: false, reason: `tope de ${config.maxTurns} respuestas alcanzado` };
  }

  // Disparadores, en orden de menor a mayor intrusión.
  if (!s.withinHours && config.outsideHours) {
    return { act: true, mode: config.mode, trigger: "fuera de horario" };
  }
  if (!s.someoneActive && config.whenNobodyActive) {
    return { act: true, mode: config.mode, trigger: "sin asesores activos" };
  }
  // En horario y con gente activa: sólo si se configuró el disparador por demora.
  // Es el caso de "activo pero saturado".
  if (
    config.idleTriggerMinutes !== null &&
    s.minutesWaiting !== null &&
    s.minutesWaiting >= config.idleTriggerMinutes
  ) {
    return {
      act: true,
      mode: config.mode,
      trigger: `${s.minutesWaiting} min sin respuesta`,
    };
  }

  return { act: false, reason: "ningún disparador aplica" };
}
