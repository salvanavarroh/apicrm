import { Bot, Calculator, HelpCircle, Inbox, LifeBuoy, Megaphone, Users } from "lucide-react";
import Link from "next/link";

import { AssistantChat } from "@/components/assistant/assistant-chat";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { greetingFor, suggestionsFor } from "@/lib/assistant/suggestions";

// La página de Ayuda es ahora el asistente a pantalla completa. Antes eran cinco
// tarjetas estáticas: servían para leer, no para resolver una duda concreta. Las
// tarjetas siguen abajo como referencia rápida y como atajo a cada sección, pero
// lo que contesta es el chat.

const SUPPORT_EMAIL = "hello@cambalache.studio";

type Topic = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
};

const TOPICS: Topic[] = [
  {
    icon: Inbox,
    title: "Inbox",
    body:
      "Todas las conversaciones de WhatsApp, Instagram y Facebook en un solo lugar. " +
      "Una conversación sin dueño está en el pool: al tomarla queda asignada a vos. " +
      "La ventana de 24 h es de WhatsApp — pasada esa hora sólo se puede reabrir con una plantilla aprobada.",
    href: "/admin/inbox",
    linkLabel: "Ir al inbox",
  },
  {
    icon: Bot,
    title: "Respuesta automática",
    body:
      "El bot contesta cuando no hay nadie disponible. Tiene dos modos: sugerir " +
      "(escribe y vos mandás) o responder solo. Nunca habla de precios, descuentos, " +
      "tasas ni señas: esos temas los deriva a un asesor siempre.",
    href: "/admin/bot",
    linkLabel: "Configurar el bot",
  },
  {
    icon: Calculator,
    title: "Cotizador de usados",
    body:
      "Toma el precio de la Guía Oficial de ACARA y le aplica los ajustes de la " +
      "concesionaria (kilómetros, estado, reacondicionamiento y margen). Muestra dos " +
      "números distintos: lo que vale en el mercado y lo que conviene ofrecer.",
    href: "/admin/valuations",
    linkLabel: "Ver los parámetros",
  },
  {
    icon: Users,
    title: "Leads y equipo",
    body:
      "Los leads se reparten entre los vendedores de la gerencia que corresponde " +
      "por sucursal y tipo de producto. Un lead sin asignar queda en el pool hasta " +
      "que alguien lo tome o el gerente lo asigne.",
    href: "/admin/leads",
    linkLabel: "Ver leads",
  },
  {
    icon: Megaphone,
    title: "Rendimiento de ads",
    body:
      "Cruza la inversión de Meta, Google y TikTok con el embudo real del CRM. " +
      "Los números son de toda la concesionaria: la inversión de una cuenta de ads " +
      "no se puede repartir por gerencia.",
    href: "/admin/ads",
    linkLabel: "Ver rendimiento",
  },
];

export default async function AyudaPage() {
  const profile = await requireProfile();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <HelpCircle className="size-6 text-accent" /> Ayuda
        </h1>
        <p className="border-l-[3px] border-accent pl-3 text-sm text-muted-foreground">
          Preguntale al asistente cómo funciona cada parte del CRM. Contesta con
          la documentación del sistema y con tus propios datos.
        </p>
      </header>

      {/* Sin alto fijo: el chat crece con la conversación hasta su tope y ahí
          scrollea. Ver la nota en assistant-chat.tsx. */}
      <div className="flex flex-col">
        <AssistantChat
          variant="page"
          suggestions={suggestionsFor(profile.role)}
          greeting={greetingFor(profile.first_name)}
        />
      </div>

      <Card className="flex flex-col gap-2 border-accent/30 bg-accent/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <LifeBuoy className="size-4 text-accent" /> ¿El asistente no supo?
        </p>
        <p className="text-sm text-muted-foreground">
          Escribinos a{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-accent hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          . Contanos en qué pantalla estabas y qué esperabas que pasara: con eso
          se resuelve mucho más rápido. Toda pregunta que el asistente no supo
          contestar nos queda registrada y se convierte en documentación.
        </p>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Referencia rápida</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {TOPICS.map((t) => (
            <Card key={t.title} className="flex flex-col gap-2 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <t.icon className="size-4 text-accent" />
                {t.title}
              </p>
              <p className="flex-1 text-sm text-muted-foreground">{t.body}</p>
              {t.href && (
                <Link
                  href={t.href}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  {t.linkLabel} →
                </Link>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
