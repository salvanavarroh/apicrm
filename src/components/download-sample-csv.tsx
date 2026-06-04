"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  headers: readonly string[];
  /** Filas de ejemplo. Cada fila es un objeto con keys = headers. */
  examples: Array<Record<string, string | number | boolean>>;
  filename: string;
  label?: string;
};

/**
 * Botón que descarga un archivo CSV de ejemplo cliente-side (sin pedir nada al
 * server). Útil para que el usuario sepa qué columnas tiene que llenar y vea
 * 2 filas reales como referencia.
 */
export function DownloadSampleCsv({
  headers,
  examples,
  filename,
  label = "Descargar archivo de ejemplo",
}: Props) {
  function build(): string {
    const lines: string[] = [];
    lines.push(headers.map(escape).join(","));
    for (const row of examples) {
      const values = headers.map((h) => escape(String(row[h] ?? "")));
      lines.push(values.join(","));
    }
    return lines.join("\n");
  }

  function download() {
    const csv = build();
    // BOM para que Excel reconozca UTF-8 con acentos.
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={download}
      className="bg-card"
    >
      <Download className="mr-2 size-4" /> {label}
    </Button>
  );
}

function escape(value: string): string {
  // RFC 4180: si contiene coma, comilla, salto de línea → comillas dobles +
  // escape de comillas internas.
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
