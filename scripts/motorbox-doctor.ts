/**
 * Chequea la integración con Motorbox CONTRA PRODUCCIÓN, no contra el código.
 *
 *   pnpm motorbox:doctor
 *   pnpm motorbox:doctor https://www.apicrm.ai
 *
 * Existe porque el 23/09/2026 salió a producción un ticket con el `iss`
 * equivocado (sin `www`) y no nos enteramos hasta que Motorbox lo rechazó: el
 * código estaba bien, la env var no. Todo lo que mira acá es lo que ve el otro
 * lado, no lo que dice el repo.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const ORIGIN = (process.argv[2] ?? "https://www.apicrm.ai").replace(/\/+$/, "");

let fallos = 0;
let avisos = 0;

/** Lo que sirve producción. Si falla, está roto para Motorbox. */
function check(ok: boolean, label: string, detalle = "") {
  if (!ok) fallos++;
  console.log(`  ${ok ? "OK   " : "FALLA"} ${label}${detalle ? `\n         ${detalle}` : ""}`);
}

/** Lo que emitiría el entorno desde el que corrés esto. En tu máquina va a
 *  diferir de producción y está bien: por eso avisa en vez de fallar. */
function local(ok: boolean, label: string, detalle = "") {
  if (!ok) avisos++;
  console.log(`  ${ok ? "OK   " : "AVISO"} ${label}${detalle ? `\n         ${detalle}` : ""}`);
}

async function main() {
  console.log(`\nRevisando ${ORIGIN}\n`);

  // 1) El JWKS, tal como lo pide Motorbox.
  const jwksUrl = `${ORIGIN}/.well-known/jwks.json`;
  const res = await fetch(jwksUrl, { redirect: "manual" });
  check(
    res.status === 200,
    `el JWKS responde 200`,
    res.status === 200 ? "" : `vino ${res.status}${res.headers.get("location") ? ` → ${res.headers.get("location")}` : ""}`,
  );
  if (res.status !== 200) {
    console.log(`\n  El JWKS no responde. Sin esto Motorbox no puede verificar nada.\n`);
    process.exit(1);
  }

  const jwks = (await res.json()) as { keys?: Array<Record<string, unknown>> };
  const key = jwks.keys?.[0];
  check(!!key, "el JWKS trae al menos una clave");
  check(!!key?.kid, "la clave tiene kid", key?.kid ? `kid: ${key.kid}` : "sin kid: no se puede rotar sin downtime");
  check(key?.alg === "RS256", "el algoritmo es RS256", `vino ${key?.alg}`);
  check(!("d" in (key ?? {})), "la clave PRIVADA no está expuesta");

  // 2) El ticket que emitiría ESTE entorno. En tu máquina apunta a localhost y
  //    no hay claves: son avisos, no fallas. Correlo con las env vars de
  //    producción (o desde el server) para que valide de verdad.
  console.log("\n  — con las variables de este entorno —");
  const { mintTicket } = await import("@/lib/motorbox/ticket");
  const { apiOrigin } = await import("@/lib/motorbox/config");
  const { decodeJwt } = await import("jose");

  const iss = apiOrigin();
  local(
    iss === ORIGIN,
    "el `iss` coincide con el host revisado",
    iss === ORIGIN ? "" : `este entorno emitiría "${iss}" y Motorbox espera "${ORIGIN}" — es MOTORBOX_ISSUER`,
  );

  try {
    const jwt = await mintTicket({
      profile: { id: "00000000-0000-4000-8000-000000000001", first_name: "Test", last_name: "Doctor", role: "admin" } as never,
      email: "doctor@test.local",
      company: { id: "00000000-0000-4000-8000-000000000002", name: "Doctor", country: "AR", status: "active" },
    });
    const pl = decodeJwt(jwt);
    local(pl.iss === ORIGIN, "el ticket emitido lleva ese mismo `iss`", `vino "${pl.iss}"`);
    local(pl.aud === "motorbox", "el `aud` es motorbox", `vino "${pl.aud}"`);
    local(!!pl.jti, "el ticket lleva jti");
    local((pl.exp as number) - (pl.iat as number) === 90, "dura 90 segundos");
  } catch (e) {
    local(false, "se puede emitir un ticket", (e as Error).message);
  }

  // 3) El endpoint de perfil: sin clave tiene que dar 401, no 404 ni 200.
  console.log("\n  — de nuevo, lo que sirve producción —");
  const perfil = await fetch(
    `${ORIGIN}/api/partners/motorbox/companies/00000000-0000-4000-8000-000000000002`,
    { redirect: "manual" },
  );
  check(
    perfil.status === 401,
    "el endpoint de perfil pide credencial",
    perfil.status === 404 ? "404: no está deployado" : perfil.status === 401 ? "" : `vino ${perfil.status}`,
  );

  // 4) El host embebido de Motorbox.
  const embed = (process.env.NEXT_PUBLIC_MOTORBOX_EMBED_ORIGIN ?? "").replace(/\/+$/, "");
  if (embed) {
    try {
      const e = await fetch(embed, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      check(e.status < 400, `el host embebido responde (${embed})`, `vino ${e.status}`);
    } catch {
      check(false, `el host embebido responde (${embed})`, "no resuelve o no contesta");
    }
  }

  const avisoTxt = avisos
    ? `  (${avisos} ${avisos === 1 ? "aviso" : "avisos"} del entorno local — normal en tu máquina)`
    : "";
  console.log(
    fallos === 0
      ? `\nProducción, en orden.${avisoTxt}\n`
      : `\n${fallos} ${fallos === 1 ? "cosa rota en producción" : "cosas rotas en producción"}.${avisoTxt}\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
