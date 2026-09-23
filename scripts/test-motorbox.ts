/**
 * Pruebas de la integración con Motorbox que NO necesitan a Motorbox.
 *
 *   pnpm test:motorbox
 *
 * Cubre lo que se puede romper solo: el marcador de atribución, la validación
 * del `state` contra open redirect, la firma de webhooks, la normalización del
 * teléfono de los canales y el formato de moneda.
 *
 * Sin framework, igual que `test-phone` y `test-bot`. No toca la base ni la
 * red. El canje del ticket se prueba contra Motorbox, no acá.
 */
import { createHmac, generateKeyPairSync } from "node:crypto";

import { loadEnvConfig } from "@next/env";

// `ticket.ts` importa la config, que valida las env públicas al cargar el
// módulo. Las levantamos de .env.local antes de importar nada — por eso los
// imports de abajo son dinámicos, dentro de main().
loadEnvConfig(process.cwd());

// OJO: `publicEnv` se parsea UNA VEZ, cuando se carga src/lib/env.ts. Escribir
// process.env después de eso no cambia nada. Por eso el entorno de prueba se
// arma acá arriba, antes del primer import dinámico.
//
// En .env.local NEXT_PUBLIC_APP_URL apunta a localhost, y un ticket con `iss`
// de localhost es rechazado por Motorbox: acá lo pisamos con el valor real.
const TEST_KEYS = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
process.env.MOTORBOX_JWT_PRIVATE_KEY_B64 = Buffer.from(
  TEST_KEYS.privateKey,
).toString("base64");
process.env.MOTORBOX_JWT_PUBLIC_KEY_B64 = Buffer.from(
  TEST_KEYS.publicKey,
).toString("base64");
process.env.MOTORBOX_JWT_KID = "mb-test";
process.env.NEXT_PUBLIC_APP_URL = "https://www.apicrm.ai";
process.env.NEXT_PUBLIC_MOTORBOX_EMBED_ORIGIN = "https://motorbox.apicrm.ai";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  const mark = ok ? "OK  " : "FALLA";
  console.log(
    `${mark} ${name}` +
      (ok
        ? ""
        : `\n      esperaba ${JSON.stringify(expected)}, vino ${JSON.stringify(actual)}`),
  );
}

async function main() {
  const { formatMoney } = await import("@/lib/format");
  const { normalizeChannelPhone } = await import("@/lib/motorbox/channel-phone");
  const { safeState } = await import("@/lib/motorbox/ticket");
  const { extractMotorboxCode } = await import("@/lib/motorbox/tracking");

  console.log("\n— El marcador de atribución —");
  check(
    "lo encuentra al final del mensaje",
    extractMotorboxCode("Hola! Me interesa este auto\n\n[MB:8f3k2]"),
    "8f3k2",
  );
  check(
    "sobrevive a que editen el principio del mensaje",
    extractMotorboxCode("che, sigue disponible?\n\n[MB:ABC123]"),
    "ABC123",
  );
  check(
    "lo busca en el caption del adjunto",
    extractMotorboxCode(null, "[MB:xy12]"),
    "xy12",
  );
  check("sin marcador devuelve null", extractMotorboxCode("Hola, quiero un auto"), null);
  check("ignora un marcador demasiado corto", extractMotorboxCode("[MB:ab]"), null);
  check("ignora texto vacío", extractMotorboxCode(null, undefined, ""), null);
  check("toma el primero si hay dos", extractMotorboxCode("[MB:aaaa] y [MB:bbbb]"), "aaaa");

  console.log("\n— El `state` del SSO (open redirect) —");
  check("una ruta interna pasa", safeState("/dealer/stock"), "/dealer/stock");
  check("un host externo NO pasa", safeState("https://evil.com"), "/dealer");
  check("protocol-relative NO pasa", safeState("//evil.com"), "/dealer");
  check("backslash NO pasa", safeState("/\\evil.com"), "/dealer");
  check("null cae al default", safeState(null), "/dealer");
  check("conserva la query", safeState("/dealer?tab=stock"), "/dealer?tab=stock");

  console.log("\n— La firma de los webhooks —");
  {
    const secret = "secreto-de-prueba";
    const body = JSON.stringify({ event_id: "evt_1", hola: "mundo" });
    const ts = String(Math.floor(Date.now() / 1000));
    const sign = (t: string, b: string) =>
      createHmac("sha256", secret).update(`${t}.${b}`).digest("hex");

    const sig = sign(ts, body);
    check("misma entrada, misma firma", sign(ts, body), sig);
    check(
      "cambiar el body cambia la firma",
      sign(ts, body.replace("mundo", "otro")) === sig,
      false,
    );
    check(
      "el timestamp entra en la firma (anti-replay)",
      sign(String(Number(ts) + 1), body) === sig,
      false,
    );
  }

  console.log("\n— El teléfono de los canales —");
  check(
    "limpia el formato de Meta",
    normalizeChannelPhone("+54 9 11 1234-5678", "AR"),
    "+5491112345678",
  );
  check("null si no hay número", normalizeChannelPhone(null, "AR"), null);
  check("null si es basura", normalizeChannelPhone("n/a", "AR"), null);

  console.log("\n— La moneda —");
  // Intl separa el símbolo del número con un espacio DURO (U+00A0), no con uno
  // normal. Lo normalizamos para comparar; si alguna vez hacés un .includes("$ ")
  // sobre esto en una pantalla, acordate de esta línea.
  const money = (v: number | null, c: string | null) =>
    formatMoney(v, c).replace(/\u00a0/g, " ");

  // Motorbox manda precio + moneda y no convierte: las dos tienen que formatear.
  check("pesos", money(28500000, "ARS"), "$ 28.500.000");
  check("dólares", money(32000, "USD"), "US$ 32.000");
  check("sin moneda asume pesos", money(1000, null), "$ 1.000");
  check("sin valor", money(null, "USD"), "—");
  check("moneda desconocida no rompe", money(500, "XYZ"), "XYZ 500");

  // ---------------------------------------------------------------------
  // El round-trip del ticket: firmamos como API y verificamos como Motorbox.
  //
  // Es la pieza que más caro sale que esté mal: si el ticket no verifica, nadie
  // entra. Generamos un par de claves al vuelo para no depender de las env
  // vars reales ni de tener a Motorbox levantado.
  // ---------------------------------------------------------------------
  console.log("\n— El ticket SSO (firma y verificación) —");
  {
    const otherKey = () =>
      generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      }).publicKey;

    const { mintTicket } = await import("@/lib/motorbox/ticket");
    const { getPublicJwk } = await import("@/lib/motorbox/keys");
    const { decodeProtectedHeader, importJWK, importSPKI, jwtVerify } = await import("jose");

    const jwt = await mintTicket({
      profile: {
        id: "6f1c2f7e-0000-4000-8000-000000000001",
        first_name: "Juan",
        last_name: "Pérez",
        role: "admin",
      } as never,
      email: "juan@delsur.com.ar",
      company: {
        id: "9a1e0000-0000-4000-8000-000000000002",
        name: "Concesionaria del Sur",
        country: "AR",
        status: "active",
      },
    });

    const header = decodeProtectedHeader(jwt);
    check("el header lleva alg RS256", header.alg, "RS256");
    // Sin kid, Motorbox no puede rotar claves sin downtime.
    check("el header lleva kid", header.kid, "mb-test");

    // Exactamente lo que hace Motorbox en el canje (spec §5.2).
    const jwk = await getPublicJwk();
    const { payload } = await jwtVerify(jwt, await importJWK(jwk, "RS256"), {
      issuer: "https://www.apicrm.ai",
      audience: "motorbox",
      clockTolerance: 30,
      maxTokenAge: "120s",
    });

    check("verifica contra el JWKS", typeof payload.jti, "string");
    check("el TTL es de 90 s", (payload.exp as number) - (payload.iat as number), 90);
    check("el sub identifica al perfil de API", payload.sub, "api_crm:profile:6f1c2f7e-0000-4000-8000-000000000001");
    check("manda el scope traducido, no el rol crudo", payload.scope, ["dealer.admin"]);
    check("el rol crudo viaja aparte", (payload.user as { role: string }).role, "admin");
    check("manda el email (no está en profiles)", (payload.user as { email: string }).email, "juan@delsur.com.ar");
    check("manda la company activa", (payload.company as { id: string }).id, "9a1e0000-0000-4000-8000-000000000002");
    check("act es null sin impersonación", payload.act, null);

    // Una clave ajena NO puede verificar: si esto falla, cualquiera falsifica tickets.
    let rejected = false;
    try {
      await jwtVerify(jwt, await importSPKI(otherKey(), "RS256"), {
        issuer: "https://www.apicrm.ai",
        audience: "motorbox",
      });
    } catch {
      rejected = true;
    }
    check("una clave ajena NO verifica el ticket", rejected, true);
  }

  console.log(
    failures === 0
      ? "\nTodo bien.\n"
      : `\n${failures} ${failures === 1 ? "prueba falló" : "pruebas fallaron"}.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
