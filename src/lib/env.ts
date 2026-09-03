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
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

const clientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
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
  });
  if (!parsed.success) explicar("servidor", parsed.error.issues);
  return parsed.data;
}
