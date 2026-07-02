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

// Saca NUL y BOM sueltos que dejan algunos exports (UTF-16 / Excel).
function cleanCell(s: string): string {
  return s.replace(/\u0000/g, "").replace(/\uFEFF/g, "").trim();
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  return cleanCell(String(value));
}

// Detecta el encoding por BOM y decodifica. Muchos exports (Meta, Excel "CSV
// UTF-16") vienen en UTF-16 LE separados por tabs; leerlos como UTF-8 corrompe
// headers y acentos ("Generación" → "Generaci�n") y rompe el mapeo con IA.
function decodeBuffer(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le", 2);
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    // UTF-16 BE → swap de bytes y decodificar como LE.
    const swapped = Buffer.from(buffer.subarray(2));
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      const t = swapped[i];
      swapped[i] = swapped[i + 1];
      swapped[i + 1] = t;
    }
    return swapped.toString("utf16le");
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return buffer.toString("utf8", 3);
  }
  // Sin BOM: si hay muchos bytes NUL en el arranque, casi seguro es UTF-16 LE.
  const head = buffer.subarray(0, Math.min(buffer.length, 200));
  let nulls = 0;
  for (const b of head) if (b === 0x00) nulls++;
  if (nulls > head.length / 4) return buffer.toString("utf16le");
  return buffer.toString("utf8");
}

function parseCsvBuffer(buffer: Buffer): ParsedFile {
  const text = decodeBuffer(buffer);
  // delimiter sin setear → Papa auto-detecta coma / tab / ; / |.
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => cleanCell(h),
  });
  const headers = (result.meta.fields ?? []).map(cleanCell).filter(Boolean);
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
