"use server";

// ============================================================================
// Reportar un problema desde el asistente.
//
// Lo que escribe la persona es corto (qué pasó, qué esperaba). Todo lo que hace
// accionable al reporte —ruta, rol, empresa, navegador, hilo de la charla— lo
// pone el servidor, no el formulario: pedirlo sería garantizar que no lo
// complete nadie.
//
// El mail a soporte es best-effort: si Resend no está configurado o falla, el
// reporte YA quedó guardado. Perder el aviso es molesto; perder el reporte, no
// se puede.
// ============================================================================

import { z } from "zod";

import { getCurrentProfile } from "@/lib/auth";
import { SUPPORT_EMAIL } from "@/lib/assistant/output";
import { sendEmail } from "@/lib/email/client";
import { fullName } from "@/lib/leads";
import { ROLE_LABELS } from "@/lib/nav";
import { effectiveRole } from "@/lib/permissions";
import { createTypedClient } from "@/lib/supabase/server";
import type { AssistantDatabase } from "@/types/assistant-db";

const schema = z.object({
  whatHappened: z
    .string()
    .trim()
    .min(10, "Contanos un poco más: con menos de 10 caracteres no se entiende")
    .max(2000),
  expected: z.string().trim().max(2000).optional(),
  route: z.string().max(300).optional(),
  threadId: z.string().uuid().optional(),
  userAgent: z.string().max(400).optional(),
});

export type ReportInput = z.input<typeof schema>;

export type ReportResult =
  | { ok: true; id: string; emailed: boolean }
  | { ok: false; message: string };

export async function reportProblem(input: ReportInput): Promise<ReportResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, message: "No hay sesión." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }
  const d = parsed.data;

  // Con el cliente del usuario: la policy exige `user_id = auth.uid()`, así que
  // nadie puede reportar a nombre de otro ni desde afuera.
  const supabase = await createTypedClient<AssistantDatabase>();
  const { data, error } = await supabase
    .from("assistant_reports")
    .insert({
      user_id: profile.id,
      company_id: profile.company_id,
      role: effectiveRole(profile),
      what_happened: d.whatHappened,
      expected: d.expected || null,
      route: d.route ?? null,
      user_agent: d.userAgent ?? null,
      thread_id: d.threadId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "No se pudo guardar" };
  }

  // A partir de acá el reporte ya está a salvo. El mail es un extra.
  let emailed = false;
  try {
    const quien = fullName(profile.first_name, profile.last_name);
    const res = await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `[CRM] Problema reportado por ${quien}`,
      replyTo: undefined,
      html: [
        `<h2>Problema reportado desde el asistente</h2>`,
        `<p><strong>Qué pasó:</strong><br>${escapeHtml(d.whatHappened)}</p>`,
        d.expected
          ? `<p><strong>Qué esperaba:</strong><br>${escapeHtml(d.expected)}</p>`
          : "",
        `<hr>`,
        `<p style="color:#666;font-size:13px">`,
        `Usuario: ${escapeHtml(quien)} · ${ROLE_LABELS[effectiveRole(profile)]}<br>`,
        `Pantalla: ${escapeHtml(d.route ?? "—")}<br>`,
        `Navegador: ${escapeHtml(d.userAgent ?? "—")}<br>`,
        `Reporte: ${data.id}`,
        `</p>`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    emailed = res.ok;
  } catch {
    // Ídem: el reporte ya está guardado.
  }

  return { ok: true, id: data.id, emailed };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}
