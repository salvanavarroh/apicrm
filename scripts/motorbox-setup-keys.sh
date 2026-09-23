#!/usr/bin/env bash
#
# Fase 0 de la integración con Motorbox: genera el par RS256 del ticket SSO y
# los dos secretos que nos toca generar a nosotros.
#
# Ver docs/motorbox-spec-api.md §2.2 y §2.3.
#
# NADA de lo que genera este script entra al repo: todo va a un directorio
# temporal fuera del árbol de git. Cargalos en Vercel y borrá el directorio.

set -euo pipefail

OUT="${TMPDIR:-/tmp}/motorbox-keys-$(date +%Y%m%d-%H%M%S)"
KID="mb-$(date +%Y-%m)"

mkdir -p "$OUT"
chmod 700 "$OUT"

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$OUT/private.pem" 2>/dev/null
openssl rsa -pubout -in "$OUT/private.pem" -out "$OUT/public.pem" 2>/dev/null
chmod 600 "$OUT"/*.pem

# base64 en una sola línea: Vercel rompe los saltos de línea de un PEM.
if base64 --help 2>&1 | grep -q '\-w'; then
  B64() { base64 -w 0 "$1"; }      # GNU coreutils
else
  B64() { base64 -i "$1" | tr -d '\n'; }  # BSD / macOS
fi

cat > "$OUT/vercel-env.txt" <<EOF
# ── Pegar en Vercel → Settings → Environment Variables (Production y Preview) ──
# Proyecto: API CRM. Generado el $(date '+%Y-%m-%d %H:%M').

MOTORBOX_JWT_KID=$KID
MOTORBOX_JWT_PRIVATE_KEY_B64=$(B64 "$OUT/private.pem")
MOTORBOX_JWT_PUBLIC_KEY_B64=$(B64 "$OUT/public.pem")

# Los TRES secretos que generamos nosotros y le compartimos a Motorbox.
MOTORBOX_PARTNER_KEY=$(openssl rand -hex 32)
MOTORBOX_WEBHOOK_SECRET=$(openssl rand -hex 32)
API_CRM_WEBHOOK_SECRET=$(openssl rand -hex 32)

# Este lo genera Motorbox y nos lo pasa. Dejar vacío hasta tenerlo.
API_CRM_PARTNER_KEY=

# El emisor del ticket. El www NO es opcional: Motorbox lo compara exacto.
# Va aparte de NEXT_PUBLIC_APP_URL, que usan los mails y el callback de Zernio.
MOTORBOX_ISSUER=https://www.apicrm.ai
MOTORBOX_PUBLIC_ORIGIN=https://www.motorbox.ai
NEXT_PUBLIC_MOTORBOX_EMBED_ORIGIN=https://motorbox.apicrm.ai
MOTORBOX_LEAD_INGEST_ENABLED=false
EOF

chmod 600 "$OUT/vercel-env.txt"

cat <<EOF

  Listo. Todo quedó en:

      $OUT

      vercel-env.txt   → los valores para pegar en Vercel
      private.pem      → la clave privada (NO SALE DE ACÁ)
      public.pem       → la pública (se publica sola en el JWKS)

  Qué hacer ahora:

    1. Abrí vercel-env.txt y cargá las variables en el proyecto de API,
       en Production y Preview.

    2. Compartile a Motorbox estas TRES, por gestor de secretos o
       mensaje efímero (nunca por mail ni WhatsApp):

         MOTORBOX_PARTNER_KEY        (para que lean perfiles de concesionaria)
         MOTORBOX_WEBHOOK_SECRET     (para que firmen lo que nos mandan)
         API_CRM_WEBHOOK_SECRET      (para que verifiquen lo que les mandamos)

       La clave PRIVADA del ticket no se comparte con nadie, nunca: ellos
       verifican contra el JWKS público, que es justamente para eso.

    3. Cuando te pasen la suya, cargá API_CRM_PARTNER_KEY.

    4. Borrá el directorio:

         rm -rf "$OUT"

  Para rotar la clave del ticket más adelante: corré esto de nuevo (el KID
  cambia solo con el mes), serví las dos claves en el JWKS por 24 h y recién
  después sacá la vieja. Ver §2.2 del spec.

EOF
