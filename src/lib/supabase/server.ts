import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Cliente del USUARIO: aplica RLS.
 *
 * Es el que tienen que usar las herramientas del asistente — nunca el de
 * service-role (ver docs/asistente-ia.md §7).
 */
export async function createClient() {
  return createTypedClient<Database>();
}

/**
 * Igual que `createClient`, pero con el schema que le pases.
 *
 * Existe para `AssistantDatabase` (el schema generado + las tablas del
 * asistente, que todavía no están en `database.ts`). Es una función aparte y no
 * un genérico en `createClient` a propósito: `ReturnType<typeof createClient>`
 * se usa en media app para tipar parámetros, y sobre una función genérica TS lo
 * resuelve a `unknown` en lugar de al default.
 */
export async function createTypedClient<DB>() {
  const cookieStore = await cookies();

  return createServerClient<DB>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — refresh handled by middleware.
          }
        },
      },
    },
  );
}
