// PRD §6.13 — 6 plantillas hardcoded en tono "vos" argentino.

export type LeadTemplateContext = {
  nombre: string;
  nombre_completo: string;
  vendedor: string;
  vehiculo: string;
  concesionaria: string;
  telefono_concesionaria: string;
  // Variables de "romper el hielo". Vienen de lead_interests y son OPCIONALES:
  // si el dato no está cargado, la línea que las usa se descarta (ver
  // applyTemplate). Nunca se manda un mensaje con un hueco.
  cuadro?: string;
  familia?: string;
  hobby?: string;
};

export type LeadTemplate = {
  id: string;
  label: string;
  description: string;
  body: string;
};

export const LEAD_TEMPLATES: LeadTemplate[] = [
  {
    id: "first_contact",
    label: "Primer contacto",
    description: "Saludo inicial cuando el lead recién entra.",
    body: `Hola {nombre}! Soy {vendedor} de {concesionaria}. Vi que estás interesado en el {vehiculo}, te escribo para ayudarte con la información que necesites. ¿Cuándo te queda cómodo charlar?`,
  },
  {
    id: "reminder",
    label: "Recordatorio",
    description: "Para retomar conversación después de unos días.",
    body: `Hola {nombre}, te escribo para ver cómo seguimos con el {vehiculo}. ¿Te quedó alguna duda? Cuando quieras coordinamos una llamada o una visita.`,
  },
  {
    id: "post_quote",
    label: "Post-presupuesto",
    description: "Después de enviar una cotización.",
    body: `Hola {nombre}, te paso el presupuesto del {vehiculo} que charlamos. Cualquier consulta me decís. Si te suma podemos coordinar una visita para verlo en persona.`,
  },
  {
    id: "soft_close",
    label: "Cierre suave",
    description: "Para mover al lead a una decisión sin presionar.",
    body: `Hola {nombre}! Cómo va? Te escribo porque tengo unas unidades del {vehiculo} disponibles y queríamos ofrecerte una propuesta antes que salgan. ¿Podemos hablar hoy?`,
  },
  {
    id: "warm_back",
    label: "Recuperar lead frío",
    description: "Reactivar a un lead inactivo hace tiempo.",
    body: `Hola {nombre}, hace un tiempo charlamos sobre el {vehiculo}. ¿Seguís buscando o cambió tu necesidad? Si querés te mando opciones nuevas que nos llegaron.`,
  },
  {
    id: "visit_drive",
    label: "Visita / Test drive",
    description: "Coordinar visita o prueba de manejo.",
    body: `Hola {nombre}! Te invito a pasar por {concesionaria} a conocer el {vehiculo}. Podemos coordinar un test drive si querés probarlo. ¿Te queda mejor un día de semana o sábado?`,
  },
];

/**
 * Reemplaza las variables de una plantilla.
 *
 * Las de interés ({cuadro}, {familia}, {hobby}) sólo se resuelven si el dato
 * está cargado. Si falta, la línea que la contiene se ELIMINA entera en vez de
 * dejar un hueco: "Hola Juan, ¿cómo va ?" es peor que no mencionarlo.
 */
export function applyTemplate(
  body: string,
  ctx: Partial<LeadTemplateContext>,
): string {
  const optional: (keyof LeadTemplateContext)[] = [
    "cuadro",
    "familia",
    "hobby",
  ];

  // Primero se descartan las líneas que piden un dato de interés que no está.
  const kept = body
    .split("\n")
    .filter((line) =>
      optional.every((k) => !line.includes(`{${k}}`) || Boolean(ctx[k])),
    )
    .join("\n");

  return kept
    .replaceAll("{nombre}", ctx.nombre || "")
    .replaceAll("{nombre_completo}", ctx.nombre_completo || "")
    .replaceAll("{vendedor}", ctx.vendedor || "")
    .replaceAll("{vehiculo}", ctx.vehiculo || "el vehículo")
    .replaceAll("{concesionaria}", ctx.concesionaria || "")
    .replaceAll("{telefono_concesionaria}", ctx.telefono_concesionaria || "")
    .replaceAll("{cuadro}", ctx.cuadro || "")
    .replaceAll("{familia}", ctx.familia || "")
    .replaceAll("{hobby}", ctx.hobby || "");
}

export function whatsappLink(phone: string, message: string): string {
  const clean = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}
