// ============================================================================
// porQueNoVeo — el explicador de permisos. SIN IA.
//
// Es la pregunta más frecuente de soporte en cualquier CRM con roles, y la que
// peor contesta un modelo suelto. Acá se resuelve con la matriz de permisos y,
// cuando hace falta, evaluando por qué la RLS no matchea ese registro puntual.
//
// LA ÚNICA EXCEPCIÓN A LA REGLA DEL CLIENTE DEL USUARIO. Para distinguir "no
// tenés permiso" de "ese id no existe" hace falta preguntar con service-role.
// Está acotado a eso:
//   · sólo se consultan las columnas de PERTENENCIA (a quién está asignado, de
//     qué sucursal es, quién lo cargó), nunca datos del registro;
//   · si el registro es de OTRA concesionaria se responde como si no existiera,
//     porque decir "existe pero es de otro" ya es filtrar información;
//   · nada de esto llega al modelo: la respuesta se arma con plantillas.
// ============================================================================

import type { Profile } from "@/lib/auth";
import type { AssistantContext } from "@/lib/assistant/context";
import { fullName } from "@/lib/leads";
import {
  explain,
  scopeOf,
  type Capability,
} from "@/lib/permissions";
import { intendedCapability, mentionedEntity } from "@/lib/assistant/router";
import { SUPPORT_EMAIL } from "@/lib/assistant/output";
import { type Tool, type ToolResult } from "@/lib/assistant/tools/types";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export const porQueNoVeo: Tool = {
  name: "porQueNoVeo",
  description: "Explica por qué el usuario no ve o no puede hacer algo, y quién sí puede.",
  async run(question: string, ctx: AssistantContext): Promise<ToolResult> {
    const entity = mentionedEntity(question);

    // Caso 1: hay un id concreto y es un lead. Se puede dar la razón exacta.
    const id = UUID_RE.exec(question)?.[0] ?? UUID_RE.exec(ctx.route ?? "")?.[0] ?? null;
    if (id && (entity === "lead" || (ctx.route ?? "").includes("/leads/"))) {
      const detail = await explainLead(ctx.profile, id);
      if (detail) return { data: detail, direct: true, note: "lead puntual" };
    }

    // Caso 2: sin id — se contesta con la matriz. El VERBO manda sobre la
    // entidad: "no puedo aprobar una venta" es sales:approve, no sales:view.
    const cap = intendedCapability(question) as Capability | null;
    if (!cap) {
      return {
        data:
          "Decime qué es lo que no ves y te digo por qué: un lead, una venta, un " +
          "reporte, el inbox, un usuario, una campaña, la lista de precios o una sucursal.",
        direct: true,
        note: "entidad no identificada",
      };
    }

    const verdict = explain(ctx.profile, cap);

    if (!verdict.allowed) {
      return { data: verdict.text, direct: true, note: `denegado ${cap}` };
    }

    // Tiene el permiso: entonces no es un problema de permisos. Puede ser el
    // alcance (lo más común) o un bug.
    const alcance = scopeOf(ctx.profile, cap);
    return {
      data: [
        verdict.text,
        alcance
          ? `Si aun así no lo ves, es por el alcance: ${alcance}. Lo que queda afuera de eso no aparece en tus listados aunque exista.`
          : "",
        `Si estás seguro de que debería estar ahí, escribinos a ${SUPPORT_EMAIL} contándonos en qué pantalla estabas.`,
      ]
        .filter(Boolean)
        .join(" "),
      direct: true,
      links: verdict.href ? [{ href: verdict.href, label: "Ir a la pantalla" }] : [],
      note: `permitido ${cap}`,
    };
  },
};

/**
 * Por qué este lead puntual no es visible para este usuario.
 *
 * Devuelve null si no hay nada que decir (existe y sí lo ve, o no se pudo
 * resolver): el llamador cae al caso genérico.
 */
async function explainLead(
  profile: Profile,
  leadId: string,
): Promise<string | null> {
  // Import diferido: así este módulo se puede cargar (y testear) sin las
  // variables de entorno de Supabase, y el cliente privilegiado sólo se
  // construye en el único camino que lo necesita.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  // Sólo columnas de pertenencia. Ningún dato del lead entra acá.
  const { data: lead } = await admin
    .from("leads")
    .select(
      "id, company_id, assigned_user_id, branch_id, product_type_id, created_by, status",
    )
    .eq("id", leadId)
    .maybeSingle();

  // No existe, o es de otra concesionaria: se responde igual en los dos casos.
  // Confirmar que existe en otro tenant ya sería filtrar información.
  if (!lead || lead.company_id !== profile.company_id) {
    return "Ese identificador no corresponde a ningún lead de tu concesionaria.";
  }

  switch (profile.role) {
    case "sales": {
      if (lead.assigned_user_id === profile.id) return null; // sí lo ve
      if (!lead.assigned_user_id) {
        return (
          "Ese lead todavía no tiene vendedor asignado, así que está en el pool y " +
          "no aparece en «Mis leads». Lo asigna tu gerente, o entra solo por la " +
          "asignación automática si está prendida para esa sucursal y tipo de producto."
        );
      }
      const quien = await nameOf(admin, lead.assigned_user_id);
      return (
        `Ese lead está asignado a ${quien}. Como vendedor ves sólo los tuyos. ` +
        "Si tiene que ser tuyo, pedile a tu gerente que te lo reasigne desde el listado de leads."
      );
    }
    case "data_provider": {
      if (lead.created_by !== profile.id) {
        return "Ese lead lo cargó otra persona. Como proveedor de datos ves sólo los que cargaste vos.";
      }
      if (lead.status !== "new") {
        return (
          "Ese lead lo cargaste vos, pero ya salió del estado Nuevo: desde ahí lo " +
          "gestiona el vendedor asignado y vos ya no lo podés editar."
        );
      }
      return null;
    }
    case "manager":
    case "supervisor": {
      if (!lead.branch_id || !lead.product_type_id) {
        return (
          "Ese lead está sin clasificar (le falta la sucursal o el tipo de producto), " +
          "así que no cae en ninguna gerencia todavía. Lo clasifica el admin desde el pool."
        );
      }
      const managerId =
        profile.role === "supervisor" && profile.manager_id
          ? profile.manager_id
          : profile.id;
      const { count } = await admin
        .from("managements")
        .select("id", { count: "exact", head: true })
        .eq("manager_id", managerId)
        .eq("branch_id", lead.branch_id)
        .eq("product_type_id", lead.product_type_id);
      if ((count ?? 0) > 0) return null; // sí lo ve
      return (
        "Ese lead es de una combinación de sucursal y tipo de producto que no está " +
        "entre tus gerencias, así que no entra en tu alcance. El admin puede " +
        "asignarte esa gerencia o reasignar el lead."
      );
    }
    case "admin":
    case "group_admin":
    case "super_admin":
      return null; // lo ven todo dentro de su alcance
    default:
      return null;
  }
}

type AdminClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>
>;

async function nameOf(
  admin: AdminClient,
  userId: string,
): Promise<string> {
  const { data } = await admin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return "otro vendedor";
  return fullName(data.first_name, data.last_name) || "otro vendedor";
}
