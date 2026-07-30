// Traduce los bloqueos de salud de WhatsApp (errores de Meta) a un mensaje claro
// en español, con "qué hacer" a grandes rasgos para explicarle al cliente y, si
// existe, un link para resolverlo. Módulo client-safe (sin secretos).

export type HealthExplanation = {
  title: string; // qué está pasando, en criollo
  whatToDo: string; // qué tiene que hacer el cliente, a grandes rasgos
  url?: string; // link para resolverlo
  urlLabel?: string;
};

const WA_MANAGER = "https://business.facebook.com/wa/manage/";
const BIZ_SECURITY = "https://business.facebook.com/settings/security_center";
const BIZ_SETTINGS = "https://business.facebook.com/settings";

// Bloqueos por código de error de Meta. Ver docs de WhatsApp Cloud API.
export function explainBlocker(
  code: number | undefined,
  fallbackDesc: string,
  fallbackSol?: string,
): HealthExplanation {
  switch (code) {
    case 141006:
    case 131042:
      return {
        title:
          "El método de pago de WhatsApp tiene un problema. Meta bloquea el envío de mensajes iniciados por el negocio (las plantillas incluidas) hasta corregirlo.",
        whatToDo:
          "Entrá a WhatsApp Manager → Configuración de pagos y agregá o corregí la tarjeta de la cuenta (y saldá cualquier deuda pendiente).",
        url: WA_MANAGER,
        urlLabel: "Abrir WhatsApp Manager",
      };
    case 141010:
      return {
        title:
          "El negocio todavía no pasó la verificación de Meta. Hasta verificarlo, el límite de mensajería y algunas funciones quedan restringidas.",
        whatToDo:
          "Entrá a Configuración del negocio → Centro de seguridad e iniciá la verificación (Meta pide documentación de la empresa, ej. CUIT y datos fiscales).",
        url: BIZ_SECURITY,
        urlLabel: "Verificar el negocio",
      };
    case 141005:
      return {
        title: "La cuenta de WhatsApp está restringida o suspendida por Meta.",
        whatToDo:
          "Revisá el estado de la cuenta en Configuración del negocio y resolvé las advertencias que aparezcan en el Centro de calidad.",
        url: BIZ_SETTINGS,
        urlLabel: "Abrir Meta Business",
      };
    default:
      return {
        title: fallbackDesc,
        whatToDo:
          fallbackSol ??
          "Revisá la configuración de la cuenta en Meta Business para resolverlo.",
        url: BIZ_SETTINGS,
        urlLabel: "Abrir Meta Business",
      };
  }
}

export function explainNameStatus(nameStatus: string): HealthExplanation | null {
  if (nameStatus === "APPROVED") return null;
  return {
    title:
      "El nombre para mostrar de tu WhatsApp todavía no fue aprobado por Meta. Hasta que lo aprueben, el límite de mensajería es menor.",
    whatToDo:
      "Suele aprobarse en 1-3 días. Si tarda o fue rechazado, revisá o cambiá el nombre en WhatsApp Manager → Configuración del número.",
    url: WA_MANAGER,
    urlLabel: "Abrir WhatsApp Manager",
  };
}
