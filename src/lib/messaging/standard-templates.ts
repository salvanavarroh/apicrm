// Set estándar de plantillas de WhatsApp por idioma (voseo AR/UY · tuteo MX/CL/CO/PE).
// Variables: {{1}} = nombre del cliente, {{2}} = vehículo, {{3}} = concesionaria.
// Derivadas de los message_templates globales del CRM (§6.5 arquitectura).

export type StandardTemplate = {
  name: string; // name en Meta (snake_case)
  category: "UTILITY" | "MARKETING";
  bodies: { voseo: string; tuteo: string };
};

export const STANDARD_TEMPLATES: StandardTemplate[] = [
  {
    name: "primer_contacto",
    category: "MARKETING",
    bodies: {
      voseo:
        "Hola {{1}}! Soy de {{3}}. Vi que estás interesado en el {{2}}, te escribo para ayudarte con la info que necesites. ¿Cuándo te queda cómodo charlar?",
      tuteo:
        "¡Hola {{1}}! Te escribo de {{3}}. Vi que estás interesado en el {{2}} y quiero ayudarte con la información que necesites. ¿Cuándo te queda cómodo platicar?",
    },
  },
  {
    name: "recordatorio",
    category: "MARKETING",
    bodies: {
      voseo:
        "Hola {{1}}, te escribo para ver cómo seguimos con el {{2}}. ¿Te quedó alguna duda? Cuando quieras coordinamos una llamada o una visita a {{3}}.",
      tuteo:
        "Hola {{1}}, te escribo para ver cómo seguimos con el {{2}}. ¿Te quedó alguna duda? Cuando quieras coordinamos una llamada o una visita a {{3}}.",
    },
  },
  {
    name: "post_presupuesto",
    category: "UTILITY",
    bodies: {
      voseo:
        "Hola {{1}}, te paso el presupuesto del {{2}} que charlamos. Cualquier consulta me decís. Si te suma, coordinamos una visita a {{3}} para verlo en persona.",
      tuteo:
        "Hola {{1}}, te comparto el presupuesto del {{2}} que platicamos. Cualquier duda me dices. Si te interesa, coordinamos una visita a {{3}} para verlo en persona.",
    },
  },
  {
    name: "cierre_suave",
    category: "MARKETING",
    bodies: {
      voseo:
        "Hola {{1}}! Cómo va? Te escribo porque tengo unas unidades del {{2}} disponibles en {{3}} y quería ofrecerte una propuesta antes que salgan. ¿Podemos hablar hoy?",
      tuteo:
        "¡Hola {{1}}! ¿Cómo estás? Te escribo porque tengo unas unidades del {{2}} disponibles en {{3}} y quería ofrecerte una propuesta antes de que se agoten. ¿Podemos hablar hoy?",
    },
  },
  {
    name: "recuperar_lead",
    category: "MARKETING",
    bodies: {
      voseo:
        "Hola {{1}}, hace un tiempo charlamos sobre el {{2}}. ¿Seguís buscando o cambió tu necesidad? Si querés te mando opciones nuevas que nos llegaron a {{3}}.",
      tuteo:
        "Hola {{1}}, hace un tiempo platicamos sobre el {{2}}. ¿Sigues buscando o cambió tu necesidad? Si quieres te mando opciones nuevas que llegaron a {{3}}.",
    },
  },
  {
    name: "visita_test_drive",
    category: "MARKETING",
    bodies: {
      voseo:
        "Hola {{1}}! Te invito a pasar por {{3}} a conocer el {{2}}. Podemos coordinar un test drive si querés probarlo. ¿Te queda mejor un día de semana o el sábado?",
      tuteo:
        "¡Hola {{1}}! Te invito a pasar por {{3}} a conocer el {{2}}. Podemos coordinar un test drive si quieres probarlo. ¿Te queda mejor entre semana o el sábado?",
    },
  },
];

// Voseo para AR/UY; tuteo para el resto de LATAM hispano.
const VOSEO_COUNTRIES = new Set(["AR", "UY"]);

export function variantForCountry(country: string | null | undefined): "voseo" | "tuteo" {
  return VOSEO_COUNTRIES.has((country ?? "AR").toUpperCase()) ? "voseo" : "tuteo";
}

// Language code de WhatsApp por país (es_AR, es_MX, es por defecto).
export function languageForCountry(country: string | null | undefined): string {
  const c = (country ?? "AR").toUpperCase();
  const map: Record<string, string> = {
    AR: "es_AR",
    MX: "es_MX",
    UY: "es_AR",
    CL: "es_CL",
    CO: "es_CO",
    PE: "es_PE",
  };
  return map[c] ?? "es";
}
