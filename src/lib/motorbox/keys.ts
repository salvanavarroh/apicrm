import { exportJWK, importPKCS8, importSPKI, type CryptoKey, type JWK } from "jose";

import { getServerEnv } from "@/lib/env";

// ============================================================================
// Claves del ticket SSO (RS256).
//
// Los PEM viajan en base64 porque Vercel maneja mal los saltos de línea de una
// env var multilínea. Se generan con `./scripts/motorbox-setup-keys.sh`.
//
// La PRIVADA no sale de acá: firma el ticket y nada más. La pública se publica
// en /.well-known/jwks.json para que Motorbox verifique sin secreto compartido
// (así rotamos sin coordinar con ellos).
// ============================================================================

function pemFromBase64(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf8");
}

// Cache a nivel módulo: importar una clave es caro y no cambia entre requests.
let privateKeyPromise: Promise<CryptoKey> | null = null;
let publicJwkPromise: Promise<JWK> | null = null;

export async function getPrivateKey(): Promise<CryptoKey> {
  if (!privateKeyPromise) {
    const b64 = getServerEnv().MOTORBOX_JWT_PRIVATE_KEY_B64;
    if (!b64) throw new Error("MOTORBOX_JWT_PRIVATE_KEY_B64 no está configurada");
    privateKeyPromise = importPKCS8(pemFromBase64(b64), "RS256").catch((e) => {
      // Si falla, limpiamos el cache: si no, una env var mal cargada queda
      // envenenando el módulo hasta el próximo deploy.
      privateKeyPromise = null;
      throw e;
    });
  }
  return privateKeyPromise;
}

/** La clave pública en formato JWK, tal como sale en el JWKS. */
export async function getPublicJwk(): Promise<JWK> {
  if (!publicJwkPromise) {
    const env = getServerEnv();
    const b64 = env.MOTORBOX_JWT_PUBLIC_KEY_B64;
    if (!b64) throw new Error("MOTORBOX_JWT_PUBLIC_KEY_B64 no está configurada");
    publicJwkPromise = (async () => {
      const key = await importSPKI(pemFromBase64(b64), "RS256");
      return {
        ...(await exportJWK(key)),
        // El `kid` es obligatorio: sin él Motorbox no puede rotar claves sin
        // downtime (no sabe cuál de las dos del JWKS le corresponde al ticket).
        kid: env.MOTORBOX_JWT_KID,
        alg: "RS256",
        use: "sig",
      } satisfies JWK;
    })().catch((e) => {
      publicJwkPromise = null;
      throw e;
    });
  }
  return publicJwkPromise;
}
