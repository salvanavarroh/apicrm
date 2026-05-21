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
