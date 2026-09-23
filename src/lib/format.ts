/**
 * Formato de moneda argentina: `$1.234.567` (sin decimales por default).
 * Pasale `{ withDecimals: true }` si querés `$1.234,50`.
 */
export function formatARS(
  value: number | string | null | undefined,
  opts?: { withDecimals?: boolean },
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: opts?.withDecimals ? 2 : 0,
    maximumFractionDigits: opts?.withDecimals ? 2 : 0,
  });
}

/**
 * Formato de moneda con la moneda explícita: `$1.234.567` o `US$1.234.567`.
 *
 * Existe aparte de `formatARS` porque Motorbox admite pesos y dólares y NO
 * convierte: manda el precio en la moneda que cargó quien vende. Convertir en
 * el camino grabaría un número calculado con la cotización de ese día, y a los
 * dos días el lead diría un precio que el vendedor nunca puso.
 *
 * `formatARS` queda como está: la usan muchas pantallas que son ARS por
 * definición (comisiones, planes, cotizaciones del CRM).
 */
export function formatMoney(
  value: number | string | null | undefined,
  currency: string | null | undefined,
  opts?: { withDecimals?: boolean },
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  const code = (currency ?? "ARS").toUpperCase();
  try {
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: code,
      minimumFractionDigits: opts?.withDecimals ? 2 : 0,
      maximumFractionDigits: opts?.withDecimals ? 2 : 0,
    });
  } catch {
    // Código de moneda desconocido: mejor mostrarlo crudo que romper la pantalla.
    return `${code} ${n.toLocaleString("es-AR")}`;
  }
}
