import { NextResponse } from "next/server";

import { getPublicJwk } from "@/lib/motorbox/keys";

// JWKS público: la clave con la que Motorbox verifica la firma de nuestros
// tickets SSO. Es pública a propósito — una clave pública se publica, no lleva
// auth.
//
// Se sirve en /.well-known/jwks.json vía un rewrite en next.config.ts: un
// directorio literal `.well-known` dentro de src/app no es confiable entre
// versiones de Next.
//
// Para ROTAR: subir la clave nueva con un `kid` nuevo, devolver las DOS acá
// durante 24 h, y recién después sacar la vieja. Ver docs/motorbox-spec-api.md §2.2.

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  try {
    const jwk = await getPublicJwk();
    return NextResponse.json(
      { keys: [jwk] },
      { headers: { "cache-control": "public, max-age=600, s-maxage=3600" } },
    );
  } catch {
    // Sin claves configuradas la integración está apagada: no es un error del
    // caller. 503 y sin cache, para que apenas se carguen las env vars el
    // próximo request ya funcione.
    return NextResponse.json(
      { keys: [] },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
