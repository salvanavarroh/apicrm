// ============================================================================
// El bucle de huecos: lo que hace que el asistente mejore solo.
//
// Todo lo que el asistente no supo contestar, o cuya respuesta recibió 👎, se
// guarda acá y se agrupa por similitud usando los mismos embeddings que ya
// calculamos. En `/super-admin/kb` aparece como "12 personas preguntaron esto",
// y de ahí sale el próximo artículo.
//
// Se guarda la PREGUNTA, nunca la respuesta ni datos del lead: es material para
// escribir documentación, no un registro de la operación.
//
// Beneficio lateral que no hay que subestimar: es investigación de producto
// gratis. Si 40 personas preguntan cómo reasignar un lead, el problema no es la
// documentación.
// ============================================================================

import { toPgVector } from "@/lib/ai/embed";
import type { UserRole } from "@/lib/auth";
import { createTypedAdminClient } from "@/lib/supabase/admin";
import type { AssistantDatabase } from "@/types/assistant-db";

/** Similitud a partir de la cual dos preguntas son "la misma". */
export const GAP_CLUSTER_SIMILARITY = 0.88;

export async function recordGap(opts: {
  question: string;
  embedding: number[] | null;
  role: UserRole;
  companyId: string | null;
}): Promise<void> {
  try {
    const admin = createTypedAdminClient<AssistantDatabase>();
    const question = opts.question.slice(0, 500);

    // ¿Ya preguntaron algo parecido? Entonces suma al mismo grupo en vez de
    // crear una fila nueva: la pantalla tiene que mostrar cuánta gente lo pidió,
    // no cuántas variantes de redacción hubo.
    if (opts.embedding) {
      const { data } = await admin.rpc("match_assistant_gaps", {
        query_embedding: toPgVector(opts.embedding),
        min_similarity: GAP_CLUSTER_SIMILARITY,
      });
      const existing = (data ?? [])[0];
      if (existing) {
        await admin.rpc("bump_assistant_gap_hit", { p_id: existing.id });
        return;
      }
    }

    await admin.from("assistant_gaps").insert({
      question,
      embedding: opts.embedding ? toPgVector(opts.embedding) : null,
      role: opts.role,
      company_id: opts.companyId,
    });
  } catch {
    // Registrar un hueco nunca puede romper la respuesta al usuario.
  }
}

/** Marca una respuesta con 👍/👎 y, si es 👎, la convierte en hueco. */
export async function recordFeedback(opts: {
  messageId: string;
  value: 1 | -1;
  note?: string | null;
  question: string;
  embedding: number[] | null;
  role: UserRole;
  companyId: string | null;
}): Promise<void> {
  if (opts.value === -1) {
    await recordGap({
      question: opts.question,
      embedding: opts.embedding,
      role: opts.role,
      companyId: opts.companyId,
    });
  }
}
