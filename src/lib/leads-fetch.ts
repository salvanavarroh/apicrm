// ============================================================================
// Helper de carga paginada de leads. PostgREST devuelve como máximo 1000 filas
// por request (max-rows de Supabase), así que para traer más hay que pedir por
// tandas con .range(). Traemos hasta LEADS_FETCH_CAP para no volcar decenas de
// miles de filas al browser; el total exacto se muestra aparte y las vistas
// (tabla/kanban) paginan del lado del cliente. Ver [[leads-page-1000-row-cap]].
// ============================================================================

export const LEADS_FETCH_CAP = 5000;
const PAGE_SIZE = 1000;

type PagedResponse<T> = {
  data: T[] | null;
  count: number | null;
  error: { message: string } | null;
};

type PagedQuery<T> = {
  range: (from: number, to: number) => PromiseLike<PagedResponse<T>>;
};

/**
 * Trae leads (o cualquier tabla) en tandas de 1000 hasta `cap`, devolviendo las
 * filas acumuladas + el total exacto. `makeQuery(withCount)` debe devolver un
 * query de supabase ya con `.select(..., { count: "exact" })` (cuando
 * `withCount`), filtros y `.order()` aplicados, PERO sin `.range()`.
 */
export async function fetchPaged<T>(
  makeQuery: (withCount: boolean) => PagedQuery<T>,
  cap: number = LEADS_FETCH_CAP,
): Promise<{ rows: T[]; total: number; capped: boolean }> {
  const rows: T[] = [];
  let total = 0;
  for (let offset = 0; offset < cap; offset += PAGE_SIZE) {
    const to = Math.min(offset + PAGE_SIZE, cap) - 1;
    const { data, count, error } = await makeQuery(offset === 0).range(
      offset,
      to,
    );
    if (error) throw new Error(error.message);
    if (offset === 0 && typeof count === "number") total = count;
    if (data && data.length > 0) rows.push(...data);
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { rows, total: total || rows.length, capped: total > rows.length };
}
