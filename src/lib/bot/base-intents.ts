// ============================================================================
// FAQ base del bot.
//
// Ocho intenciones que cubren la mayoría de los mensajes que llegan de noche a
// una concesionaria. Se cargan como punto de partida y el admin las edita: el
// texto es SUYO, el bot nunca redacta.
//
// `precio` está a propósito en la lista pero su respuesta NO da un número:
// deriva al asesor. Es la intención más frecuente y la más peligrosa, así que
// tiene que existir con una respuesta segura en vez de caer en "desconocida".
// ============================================================================

export type BaseIntent = {
  slug: string;
  label: string;
  keywords: string[];
  reply: string;
};

export const BASE_INTENTS: BaseIntent[] = [
  {
    slug: "saludo",
    label: "Saludo inicial",
    keywords: ["hola", "buenas", "buen dia", "buenas tardes", "buenas noches"],
    reply:
      "¡Hola! Te responde el asistente de {concesionaria}. Ahora no hay asesores conectados, pero dejame tu consulta y te contestan en cuanto abrimos. Si querés hablar con una persona ya, escribí *asesor*.",
  },
  {
    slug: "precio",
    label: "Precio o financiación puntual",
    keywords: [
      "precio",
      "cuanto sale",
      "cuanto cuesta",
      "valor",
      "cotizacion",
      "descuento",
      "bonificacion",
      "cuota",
      "tasa",
      "anticipo",
    ],
    // Nunca un número: la lista cambia mes a mes y una promesa del bot es, para
    // el cliente, la palabra de la concesionaria.
    reply:
      "El precio con la bonificación vigente te lo pasa un asesor, así te llega el número exacto del día. Ya le avisé que estás preguntando. Mientras tanto, ¿qué modelo te interesa?",
  },
  {
    slug: "horarios",
    label: "Horarios de atención",
    keywords: ["horario", "abren", "cierran", "sabado", "domingo", "atienden"],
    reply:
      "Atendemos {horario}. Si me dejás tu consulta ahora, un asesor te responde cuando abrimos.",
  },
  {
    slug: "ubicacion",
    label: "Dirección y cómo llegar",
    keywords: ["donde", "direccion", "ubicacion", "sucursal", "como llego"],
    // Antes decía "Estamos en {sucursal}", que es el NOMBRE de la sucursal
    // ("Estamos en Quilmes"). La dirección ya está cargada en la sucursal.
    reply:
      "Estamos en {direccion} ({sucursal}). Si querés pasar, avisame y coordinamos con un asesor para que te esté esperando.",
  },
  {
    slug: "modelos",
    label: "Qué marcas y modelos trabajan",
    keywords: ["tienen", "trabajan", "marcas", "modelos", "stock", "0km", "usados"],
    reply:
      "Trabajamos varias marcas, tanto 0km como usados. Contame qué modelo estás buscando y el asesor te confirma disponibilidad.",
  },
  {
    slug: "financiacion",
    label: "Financiación en general",
    keywords: ["financiacion", "financian", "credito", "plan", "cuotas", "prendario"],
    // Habla del mecanismo, no de números.
    reply:
      "Sí, trabajamos con financiación y planes de ahorro. Las condiciones dependen del modelo y de tu situación, así que el asesor te armá la opción que mejor te cierre. ¿Qué modelo tenés en mente?",
  },
  {
    slug: "usado",
    label: "Toman usado en parte de pago",
    keywords: ["usado", "permuta", "entrego", "parte de pago", "tasacion", "tasar"],
    reply:
      "Sí, tomamos usados en parte de pago. La tasación la hace un asesor viendo la unidad. Si me contás marca, modelo, año y kilómetros, se lo paso adelantado.",
  },
  {
    slug: "postventa",
    label: "Service y posventa",
    keywords: ["service", "turno", "taller", "garantia", "repuesto", "arreglo"],
    reply:
      "Para service y posventa te atiende el área correspondiente, {horario}. Dejame tu consulta y te contactan.",
  },
];

/**
 * Temas que NUNCA se responden con contenido, ni siquiera si el admin cargó una
 * respuesta. Corre ANTES del clasificador y no es configurable.
 *
 * Es la diferencia entre este bot y el que le ofreció descuentos no autorizados
 * al cliente el año pasado.
 */
export const HARD_BLOCKLIST: string[] = [
  "descuento",
  "bonificacion",
  "rebaja",
  "ultimo precio",
  "tasa",
  "cft",
  "tna",
  "entrega inmediata",
  "reserva",
  "seña",
  "senia",
];
