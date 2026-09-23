import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  RESEND_FROM_NAME: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  // Mensajería omnicanal (Zernio). Opcionales hasta activar las fases de WhatsApp/Lead Ads.
  ZERNIO_API_KEY: z.string().optional(),
  ZERNIO_WEBHOOK_SECRET: z.string().optional(),
  // Motorbox. Todas opcionales: sin ellas la integración se apaga sola (ver
  // `motorboxReady()` en src/lib/motorbox/config.ts) en vez de romper el build.
  // El `iss` del ticket. Va SEPARADO de NEXT_PUBLIC_APP_URL a propósito: es un
  // valor de contrato con Motorbox que se compara carácter por carácter, y
  // NEXT_PUBLIC_APP_URL la usan los mails de invitación y el callback de Zernio.
  // Atarlos hacía que cambiar una rompiera la otra en silencio (pasó el 23/09).
  MOTORBOX_ISSUER: z.string().url().optional(),
  MOTORBOX_JWT_PRIVATE_KEY_B64: z.string().optional(),
  MOTORBOX_JWT_PUBLIC_KEY_B64: z.string().optional(),
  MOTORBOX_JWT_KID: z.string().optional(),
  MOTORBOX_PARTNER_KEY: z.string().optional(),
  MOTORBOX_WEBHOOK_SECRET: z.string().optional(),
  API_CRM_PARTNER_KEY: z.string().optional(),
  API_CRM_WEBHOOK_SECRET: z.string().optional(),
  MOTORBOX_PUBLIC_ORIGIN: z.string().url().optional(),
  MOTORBOX_LEAD_INGEST_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_MOTORBOX_EMBED_ORIGIN: z.string().url().optional(),
});

const clientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_MOTORBOX_EMBED_ORIGIN:
    process.env.NEXT_PUBLIC_MOTORBOX_EMBED_ORIGIN,
};

/**
 * Falta una variable: se explica QUÉ falta y DÓNDE se pone.
 *
 * El `.parse()` pelado tiraba un ZodError crudo en medio del build, y Next lo
 * envolvía en "Failed to collect page data for /api/cars/catalog" — una ruta que
 * no tiene nada que ver. Con ese mensaje, el deploy de producción estuvo roto
 * más de veinte commits sin que nadie pudiera decir por qué.
 */
function explicar(scope: "cliente" | "servidor", issues: { path: PropertyKey[] }[]): never {
  const faltan = issues.map((i) => String(i.path[0])).join(", ");
  throw new Error(
    `Faltan variables de entorno (${scope}): ${faltan}.\n` +
      `  · En local: van en .env.local — ver .env.example.\n` +
      `  · En Vercel: Settings → Environment Variables del proyecto, y tienen ` +
      `que estar en los tres entornos (Production, Preview y Development).\n` +
      `  · En GitHub Actions: Settings → Secrets → Actions.\n` +
      `Sin esto el build falla acá, en la validación, antes de compilar nada.`,
  );
}

function parseClient() {
  const parsed = clientSchema.safeParse(clientEnv);
  if (!parsed.success) explicar("cliente", parsed.error.issues);
  return parsed.data;
}

export const publicEnv = parseClient();

export function getServerEnv() {
  const parsed = serverSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_FROM_NAME: process.env.RESEND_FROM_NAME,
    SENTRY_DSN: process.env.SENTRY_DSN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    ZERNIO_API_KEY: process.env.ZERNIO_API_KEY,
    ZERNIO_WEBHOOK_SECRET: process.env.ZERNIO_WEBHOOK_SECRET,
    MOTORBOX_ISSUER: process.env.MOTORBOX_ISSUER,
    MOTORBOX_JWT_PRIVATE_KEY_B64: process.env.MOTORBOX_JWT_PRIVATE_KEY_B64,
    MOTORBOX_JWT_PUBLIC_KEY_B64: process.env.MOTORBOX_JWT_PUBLIC_KEY_B64,
    MOTORBOX_JWT_KID: process.env.MOTORBOX_JWT_KID,
    MOTORBOX_PARTNER_KEY: process.env.MOTORBOX_PARTNER_KEY,
    MOTORBOX_WEBHOOK_SECRET: process.env.MOTORBOX_WEBHOOK_SECRET,
    API_CRM_PARTNER_KEY: process.env.API_CRM_PARTNER_KEY,
    API_CRM_WEBHOOK_SECRET: process.env.API_CRM_WEBHOOK_SECRET,
    MOTORBOX_PUBLIC_ORIGIN: process.env.MOTORBOX_PUBLIC_ORIGIN,
    MOTORBOX_LEAD_INGEST_ENABLED: process.env.MOTORBOX_LEAD_INGEST_ENABLED,
  });
  if (!parsed.success) explicar("servidor", parsed.error.issues);
  return parsed.data;
}
