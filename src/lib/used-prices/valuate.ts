// ============================================================================
// Motor de tasación de usados.
//
// Función PURA: no toca la base ni la red. Todo lo que necesita entra por
// parámetro y sale un desglose completo. Así se puede testear de verdad, que en
// una función que decide cuánta plata se ofrece por un auto no es un lujo.
//
// ----------------------------------------------------------------------------
// EL CONCEPTO QUE HAY QUE NO PERDER DE VISTA
// ----------------------------------------------------------------------------
// El precio de la guía NO es la cotización. Son tres números distintos:
//
//   1. valor de guía   → lo que dice ACARA para esa versión y año
//   2. valor de mercado → guía ajustado por km y estado de ESTE auto
//   3. oferta de toma   → mercado − reacondicionamiento − margen
//
// El cliente va a confundir 2 con 3 ("¿cómo me lo tomás a 16 si vale 18?"), así
// que la UI muestra los dos y el motor los devuelve separados.
// ============================================================================

export type VehicleCondition = "excelente" | "bueno" | "regular" | "malo";

export const CONDITION_LABEL: Record<VehicleCondition, string> = {
  excelente: "Excelente",
  bueno: "Bueno",
  regular: "Regular",
  malo: "Malo",
};

export type ValuationSettings = {
  reconPercent: number;
  marginPercent: number;
  kmPerYear: number;
  kmPenaltyPer10k: number;
  kmBonusPer10k: number;
  kmAdjustCap: number;
  conditionAdjust: Record<VehicleCondition, number>;
  spreadPercent: number;
};

export const DEFAULT_SETTINGS: ValuationSettings = {
  reconPercent: 6,
  marginPercent: 8,
  kmPerYear: 15000,
  kmPenaltyPer10k: 1.5,
  kmBonusPer10k: 0.8,
  kmAdjustCap: 15,
  conditionAdjust: { excelente: 3, bueno: 0, regular: -5, malo: -12 },
  spreadPercent: 4,
};

export type ValuationInput = {
  /** Valor de la guía para esa versión y año. */
  guideValue: number;
  year: number;
  km: number;
  condition: VehicleCondition;
  /** Año actual, explícito: la función es pura y no lee el reloj. */
  currentYear: number;
  /** Precio del 0km de la misma versión, si la guía lo trae. Es el techo. */
  newPrice?: number | null;
};

export type ValuationStep = {
  label: string;
  /** Puntos porcentuales aplicados sobre el valor de guía. */
  percent: number;
  detail: string;
};

export type Valuation = {
  guideValue: number;
  /** Lo que vale en el mercado, con los ajustes de este auto. */
  marketValue: number;
  /** Rango de toma sugerido. */
  offerMin: number;
  offerMax: number;
  /** El del medio: el número que se le pasa al cliente. */
  offerSuggested: number;
  steps: ValuationStep[];
  /** Avisos para el asesor. No bloquean: informan. */
  warnings: string[];
};

/** Kilómetros esperados para la edad del vehículo. */
export function expectedKm(
  year: number,
  currentYear: number,
  kmPerYear: number,
): number {
  // Un 0km del año en curso ya rodó algo; se cuenta medio año para no castigar
  // a un auto del año por tener 8.000 km.
  const age = Math.max(0.5, currentYear - year);
  return Math.round(age * kmPerYear);
}

function round100(n: number): number {
  // Redondeo a la centena: un número como 16.384.271 no lo dice ningún vendedor.
  return Math.round(n / 100) * 100;
}

export function valuate(
  input: ValuationInput,
  settings: ValuationSettings = DEFAULT_SETTINGS,
): Valuation {
  const steps: ValuationStep[] = [];
  const warnings: string[] = [];

  // ---- Ajuste por kilómetros ---------------------------------------------
  const expected = expectedKm(input.year, input.currentYear, settings.kmPerYear);
  const deltaKm = input.km - expected;
  const per10k = deltaKm / 10000;
  let kmPercent =
    deltaKm >= 0
      ? -(per10k * settings.kmPenaltyPer10k)
      : -per10k * settings.kmBonusPer10k;
  // Tope simétrico: sin esto, 400.000 km da un valor negativo y 0 km lo pone
  // por encima del 0km.
  const capped = Math.max(
    -settings.kmAdjustCap,
    Math.min(settings.kmAdjustCap, kmPercent),
  );
  if (capped !== kmPercent) {
    warnings.push(
      `El ajuste por kilómetros se topó en ${settings.kmAdjustCap}%. Revisalo a mano.`,
    );
  }
  kmPercent = capped;
  steps.push({
    label: "Kilómetros",
    percent: kmPercent,
    detail:
      deltaKm === 0
        ? `${input.km.toLocaleString("es-AR")} km, justo lo esperado`
        : deltaKm > 0
          ? `${input.km.toLocaleString("es-AR")} km · ${deltaKm.toLocaleString("es-AR")} más que los ${expected.toLocaleString("es-AR")} esperados`
          : `${input.km.toLocaleString("es-AR")} km · ${Math.abs(deltaKm).toLocaleString("es-AR")} menos que los ${expected.toLocaleString("es-AR")} esperados`,
  });

  // ---- Ajuste por estado --------------------------------------------------
  const condPercent = settings.conditionAdjust[input.condition] ?? 0;
  steps.push({
    label: "Estado",
    percent: condPercent,
    detail: CONDITION_LABEL[input.condition],
  });

  // ---- Valor de mercado ---------------------------------------------------
  const marketRaw = input.guideValue * (1 + (kmPercent + condPercent) / 100);
  let marketValue = round100(Math.max(0, marketRaw));

  // El 0km es el techo: un usado por encima del 0km es un error de carga, no una
  // oportunidad.
  if (input.newPrice && marketValue > input.newPrice) {
    marketValue = round100(input.newPrice);
    warnings.push(
      "El valor ajustado quedaba por encima del 0km: se topó al precio del 0km.",
    );
  }

  // ---- Oferta de toma -----------------------------------------------------
  steps.push({
    label: "Reacondicionamiento",
    percent: -settings.reconPercent,
    detail: "Lo que cuesta ponerlo en condiciones de vender",
  });
  steps.push({
    label: "Margen",
    percent: -settings.marginPercent,
    detail: "Margen del concesionario por rotarlo",
  });

  const offerBase =
    marketValue * (1 - (settings.reconPercent + settings.marginPercent) / 100);
  const spread = offerBase * (settings.spreadPercent / 100);
  const offerMin = round100(Math.max(0, offerBase - spread));
  const offerMax = round100(Math.max(0, offerBase + spread));
  const offerSuggested = round100(Math.max(0, offerBase));

  if (input.km > 300000) {
    warnings.push("Más de 300.000 km: conviene tasarlo a ojo, no por tabla.");
  }
  if (input.currentYear - input.year > 15) {
    warnings.push(
      "Más de 15 años: la guía pierde precisión y el mercado se maneja por estado.",
    );
  }

  return {
    guideValue: input.guideValue,
    marketValue,
    offerMin,
    offerMax,
    offerSuggested,
    steps,
    warnings,
  };
}
