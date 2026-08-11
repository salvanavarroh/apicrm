import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/providers/query-provider";

import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

const TITLE = "API — CRM para concesionarios";
const DESCRIPTION =
  "Centralizá la captación, gestión y conversión de leads de tu concesionaria: pipeline, WhatsApp, presupuestos, ventas y reportes en un solo lugar.";

export const metadata: Metadata = {
  // Necesario para que og:image y twitter:image salgan como URL absoluta: si
  // falta, las redes reciben una ruta relativa y no muestran el preview.
  //
  // `NEXT_PUBLIC_APP_URL` se inlinea en build, así que si no está definida en
  // Vercel al momento de compilar el preview queda apuntando a localhost. Por
  // eso se cae a `VERCEL_PROJECT_PRODUCTION_URL`, que Vercel inyecta siempre.
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · API" },
  description: DESCRIPTION,
  applicationName: "API",
  openGraph: {
    type: "website",
    siteName: "API",
    locale: "es_AR",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  // El favicon, el icono de iOS y las imágenes de preview los cablea Next por
  // convención de archivo: icon.png, apple-icon.png, favicon.ico,
  // opengraph-image.png y twitter-image.png viven en src/app/.
  // Se generan con `python3 scripts/generate-brand-assets.py`.
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${dmSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <QueryProvider>{children}</QueryProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
