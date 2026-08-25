// ============================================================================
// Preguntas sugeridas, por rol.
//
// Un chat vacío con un cursor titilando es la peor primera impresión posible:
// nadie sabe qué se le puede preguntar. Estas sugerencias son el manual de uso
// del asistente, y están elegidas para que cada rol vea al menos una de cada
// tipo (producto, datos, permisos, navegación) — así descubre que hace las
// cuatro cosas sin que haya que explicárselo.
//
// Función pura: el saludo y las sugerencias se calculan en el server y bajan
// como props.
// ============================================================================

import type { UserRole } from "@/lib/auth";

export type Suggestion = { label: string; question: string };

const BY_ROLE: Record<UserRole, Suggestion[]> = {
  sales: [
    { label: "¿Cuántos leads sin contactar tengo?", question: "¿Cuántos leads sin contactar tengo?" },
    { label: "¿Qué tengo para hoy?", question: "¿Qué tareas y visitas tengo hoy?" },
    { label: "¿Cómo genero un presupuesto?", question: "¿Cómo genero un presupuesto para un lead?" },
    { label: "¿Por qué no veo un lead?", question: "¿Por qué no veo un lead que sé que existe?" },
  ],
  manager: [
    { label: "¿Cómo viene mi equipo?", question: "¿Cómo viene la carga de mi equipo?" },
    { label: "¿Cómo se reparten los leads?", question: "¿Cómo funciona la asignación automática de leads?" },
    { label: "Ventas para aprobar", question: "¿Qué ventas tengo esperando aprobación?" },
    { label: "¿Cómo invito un vendedor?", question: "¿Cómo invito a un vendedor nuevo a mi equipo?" },
  ],
  supervisor: [
    { label: "¿Cómo viene el equipo?", question: "¿Cómo viene la carga del equipo?" },
    { label: "¿Qué puedo hacer con mi rol?", question: "¿Qué puedo hacer y qué no como supervisor?" },
    { label: "Ventas para aprobar", question: "¿Qué ventas están esperando aprobación?" },
    { label: "¿Cómo reasigno un lead?", question: "¿Cómo reasigno un lead a otro vendedor?" },
  ],
  admin: [
    { label: "¿Cómo voy este mes?", question: "¿Cuántos leads entraron y cuántas ventas se cerraron este mes?" },
    { label: "¿Cómo configuro el bot?", question: "¿Cómo configuro la respuesta automática del inbox?" },
    { label: "¿Cómo importo una base?", question: "¿Cómo importo una base de leads desde un archivo?" },
    { label: "¿Qué reportes hay?", question: "¿Qué reportes tengo disponibles y qué contesta cada uno?" },
  ],
  group_admin: [
    { label: "¿Cómo cambio de marca?", question: "¿Cómo cambio de marca activa?" },
    { label: "¿Cómo voy este mes?", question: "¿Cuántos leads entraron y cuántas ventas se cerraron este mes?" },
    { label: "¿Qué reportes hay?", question: "¿Qué reportes tengo disponibles?" },
    { label: "¿Cómo importo una base?", question: "¿Cómo importo una base de leads desde un archivo?" },
  ],
  data_provider: [
    { label: "¿Cómo cargo leads?", question: "¿Cómo cargo una base de leads?" },
    { label: "¿Hasta cuándo puedo editar?", question: "¿Hasta cuándo puedo editar un lead que cargué?" },
    { label: "¿Qué es el pool?", question: "¿Qué son los leads sin clasificar?" },
    { label: "¿Cuántos cargué este mes?", question: "¿Cuántos leads cargué este mes?" },
  ],
  super_admin: [
    { label: "¿Cómo doy de alta una cuenta?", question: "¿Cómo doy de alta una concesionaria nueva?" },
    { label: "¿Cómo funciona la impersonación?", question: "¿Cómo funciona «acceder como» otro usuario?" },
    { label: "¿Qué planes hay?", question: "¿Qué planes de suscripción hay?" },
    { label: "¿Cómo funcionan los grupos?", question: "¿Cómo funcionan los grupos multimarca?" },
  ],
};

export function suggestionsFor(role: UserRole): Suggestion[] {
  return BY_ROLE[role] ?? BY_ROLE.sales;
}

export function greetingFor(firstName: string | null): string {
  const name = firstName?.trim().split(" ")[0];
  return [
    name ? `Hola ${name}.` : "Hola.",
    "Preguntame cómo se hace algo en el CRM, por qué no ves algo, o pedime tus números.",
    "Te contesto con lo que hay documentado y con tus propios datos — nunca invento.",
  ].join(" ");
}
