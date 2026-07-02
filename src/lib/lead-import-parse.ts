// ============================================================================
// Parser server-only para la carga de leads con IA. Convierte cualquier archivo
// tabular de leads en { headers, rows }, detectando el formato por el CONTENIDO
// (no por la extensión) para ser robusto ante:
//   - Excel .xlsx (zip) y .xls (OLE2)
//   - CSV/TSV en UTF-8, UTF-16 LE/BE (con o sin BOM) y Latin-1/Windows-1252
//   - cualquier delimitador (coma / tab / ; / |), auto-detectado por Papa
// Headers TAL CUAL vienen (para que la IA vea los nombres reales), valores str.
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

// --------------------------------------------------------------------------
// Detección de formato por firma binaria (magic bytes).
// --------------------------------------------------------------------------
function looksLikeExcel(buffer: Buffer): boolean {
  // xlsx / xlsm = zip → "PK\x03\x04". xls (BIFF/OLE2) → D0 CF 11 E0.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  ) {
    return true;
  }
  return (
    buffer.length >= 4 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  );
}

// --------------------------------------------------------------------------
// Decodificación de texto con detección de encoding.
// --------------------------------------------------------------------------
function decodeText(buffer: Buffer): string {
  // BOMs explícitos.
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le", 2);
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
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

  // Sin BOM: UTF-16 sin BOM se delata por muchos bytes NUL. Miramos qué "lado"
  // tiene los NUL (par = LE, impar = BE) sobre una muestra.
  const head = buffer.subarray(0, Math.min(buffer.length, 4096));
  let nullsEven = 0;
  let nullsOdd = 0;
  for (let i = 0; i < head.length; i++) {
    if (head[i] !== 0x00) continue;
    if (i % 2 === 0) nullsEven++;
    else nullsOdd++;
  }
  const nulls = nullsEven + nullsOdd;
  if (nulls > head.length / 8) {
    if (nullsEven >= nullsOdd) {
      // NUL en posiciones pares → UTF-16 BE (byte alto primero). Swap → LE.
      const swapped = Buffer.from(buffer);
      for (let i = 0; i + 1 < swapped.length; i += 2) {
        const t = swapped[i];
        swapped[i] = swapped[i + 1];
        swapped[i + 1] = t;
      }
      return swapped.toString("utf16le");
    }
    return buffer.toString("utf16le");
  }

  // UTF-8 estricto; si el archivo no es UTF-8 válido (acentos Latin-1 de exports
  // viejos), TextDecoder tira → caemos a Windows-1252.
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder("windows-1252").decode(buffer);
    } catch {
      return buffer.toString("latin1");
    }
  }
}

// --------------------------------------------------------------------------
// Parsers concretos.
// --------------------------------------------------------------------------
function parseCsvBuffer(buffer: Buffer): ParsedFile {
  const text = decodeText(buffer);
  // delimiter sin setear → Papa auto-detecta coma / tab / ; / |.
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
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
  const wb = XLSX.read(buffer, { type: "buffer", codepage: 65001 });
  // Primera hoja con contenido.
  const sheetName =
    wb.SheetNames.find((n) => {
      const s = wb.Sheets[n];
      return s && s["!ref"];
    }) ?? wb.SheetNames[0];
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

  // La primera fila NO vacía es el header (algunos exports traen filas de título).
  let headerIdx = 0;
  while (
    headerIdx < matrix.length &&
    (matrix[headerIdx] as unknown[]).every((c) => stringify(c) === "")
  ) {
    headerIdx++;
  }
  const headers = (matrix[headerIdx] as unknown[])
    .map((h) => stringify(h))
    .filter(Boolean);
  const rows: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
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

// --------------------------------------------------------------------------
// Entry point: decide por contenido, con fallback al otro parser.
// --------------------------------------------------------------------------
export function parseImportFile(
  buffer: Buffer,
  fileTypeHint: ImportFileType,
): ParsedFile {
  // El contenido manda sobre la extensión (un .csv que en realidad es xlsx, o
  // al revés, se parsea igual).
  const primary: ImportFileType = looksLikeExcel(buffer)
    ? "excel"
    : fileTypeHint;

  const runners: Record<ImportFileType, () => ParsedFile> = {
    excel: () => parseExcelBuffer(buffer),
    csv: () => parseCsvBuffer(buffer),
  };
  const order: ImportFileType[] =
    primary === "excel" ? ["excel", "csv"] : ["csv", "excel"];

  let last: ParsedFile = { headers: [], rows: [] };
  for (const kind of order) {
    try {
      const parsed = runners[kind]();
      if (parsed.headers.length > 0 && parsed.rows.length > 0) return parsed;
      if (parsed.headers.length > last.headers.length) last = parsed;
    } catch {
      // probamos el siguiente parser
    }
  }
  return last;
}

/** Muestra representativa de filas para mandarle a la IA (headers + N filas). */
export function sampleRows<T>(rows: T[], n = 30): T[] {
  if (rows.length <= n) return rows;
  // Tomamos las primeras N: suele bastar para inferir el esquema y es barato.
  return rows.slice(0, n);
}
