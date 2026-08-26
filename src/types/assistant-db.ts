// ============================================================================
// Tipos del asistente.
//
// Este archivo llegó a tener las tablas del asistente escritas a mano, porque la
// migración todavía no estaba aplicada y `database.ts` (que lo genera
// `pnpm db:types` contra el proyecto) no las conocía. Ya está aplicada: los
// tipos salen de la base y esto quedó como una capa fina de nombres cómodos.
//
// `AssistantDatabase` se mantiene como alias de `Database` para no tocar los
// ~15 llamadores de `createTypedClient<AssistantDatabase>()`, y para que el día
// que haga falta volver a superponer algo el lugar exista y sea uno solo.
//
// NOTA sobre `vector`: supabase-js no tiene un tipo para `vector`, así que la
// columna `embedding` viaja como `string` (el formato de texto de pgvector:
// "[0.1,0.2,…]"). Ninguna consulta de la app la proyecta — el embedding entra
// por `.rpc()` y la comparación pasa entera dentro de SQL.
// ============================================================================

import type { Database } from "@/types/database";

export type AssistantDatabase = Database;

export type AssistantReportStatus =
  Database["public"]["Enums"]["assistant_report_status"];
export type AssistantReportRow =
  Database["public"]["Tables"]["assistant_reports"]["Row"];

export type UserRoleEnum = Database["public"]["Enums"]["user_role"];
export type CompanyPlanEnum = Database["public"]["Enums"]["company_plan"];
export type KbSource = Database["public"]["Enums"]["kb_source"];
export type AssistantGapStatus =
  Database["public"]["Enums"]["assistant_gap_status"];

/** Una fila de `match_kb`: el fragmento recuperado con su puntaje. */
export type KbMatch = Database["public"]["Functions"]["match_kb"]["Returns"][number];

export type KbArticleRow = Database["public"]["Tables"]["kb_articles"]["Row"];
export type KbChunkRow = Database["public"]["Tables"]["kb_chunks"]["Row"];
export type AssistantGapRow =
  Database["public"]["Tables"]["assistant_gaps"]["Row"];
