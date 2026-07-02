// ============================================================================
// Parser server-only para la carga de leads con IA. Convierte el archivo crudo
// (CSV o Excel) en { headers, rows } con los headers TAL CUAL vienen (para que
// la IA vea los nombres reales) y los valores como strings.
// ============================================================================

import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ImportFileType = "csv" | "excel";

export type ParsedFile = {
  headers: string[];
  rows: Record<string, string>[];
};

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseCsvBuffer(buffer: Buffer): ParsedFile {
  const text = buffer.toString("utf-8");
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const headers = (result.meta.fields ?? []).filter(Boolean);
  const rows: Record<string, string>[] = (result.data ?? []).map((raw) => {
    const out: Record<string, string> = {};
    for (const h of headers) out[h] = stringify(raw[h]);
    return out;
  });
  return { headers, rows: dropEmptyRows(rows) };
}

function parseExcelBuffer(buffer: Buffer): ParsedFile {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = wb.Sheets[sheetName];
  // header:1 → array de arrays; raw:false → fechas/números formateados a texto.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  if (matrix.length === 0) return { headers: [], rows: [] };

  const headers = (matrix[0] as unknown[]).map((h) => stringify(h)).filter(Boolean);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i] as unknown[];
    const out: Record<string, string> = {};
    headers.forEach((h, idx) => {
      out[h] = stringify(cells[idx]);
    });
    rows.push(out);
  }
  return { headers, rows: dropEmptyRows(rows) };
}

function dropEmptyRows(rows: Record<string, string>[]): Record<string, string>[] {
  return rows.filter((r) => Object.values(r).some((v) => v.length > 0));
}

export function parseImportFile(
  buffer: Buffer,
  fileType: ImportFileType,
): ParsedFile {
  return fileType === "excel"
    ? parseExcelBuffer(buffer)
    : parseCsvBuffer(buffer);
}

/** Muestra representativa de filas para mandarle a la IA (headers + N filas). */
export function sampleRows<T>(rows: T[], n = 30): T[] {
  if (rows.length <= n) return rows;
  // Tomamos las primeras N: suele bastar para inferir el esquema y es barato.
  return rows.slice(0, n);
}
