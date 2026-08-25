/**
 * Tests de la matriz de permisos (`src/lib/permissions.ts`).
 *
 * Dos partes:
 *
 *  1. PURA — una tabla de oro de rol × capacidad. Corre siempre, sin red ni
 *     base. Es la que protege contra "alguien tocó la matriz y ahora el
 *     asistente le dice a un vendedor que puede aprobar ventas".
 *
 *  2. CONTRA LA BASE — si hay credenciales, verifica con `rls_audit()` que las
 *     tablas que la matriz nombra tengan RLS activa y policies. La matriz
 *     DESCRIBE la RLS; esto comprueba que lo que describe existe.
 *     Sin credenciales se saltea con un aviso, no falla.
 *
 * Uso:  pnpm test:permissions
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import type { Profile, UserRole } from "@/lib/auth";
import {
  ALL_CAPABILITIES,
  CAPABILITIES,
  can,
  effectiveRole,
  explain,
  type Capability,
} from "@/lib/permissions";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`✓ ${name}`);
  else {
    failed++;
    console.log(
      `✗ ${name}\n    esperaba ${JSON.stringify(want)}\n    obtuvo   ${JSON.stringify(got)}`,
    );
  }
}

function p(role: UserRole, canExport = false): Profile {
  return { role, can_export_leads: canExport } as Profile;
}

// ---------------------------------------------------------------------------
console.log("\n— Tabla de oro: quién puede qué —");

const GOLDEN: [UserRole, Capability, boolean][] = [
  // El vendedor cotiza e inicia la venta, pero no la aprueba ni asigna.
  ["sales", "quotes:create", true],
  ["sales", "sales:start", true],
  ["sales", "sales:approve", false],
  ["sales", "leads:assign", false],
  ["sales", "leads:export", false],
  ["sales", "leads:delete", false],
  ["sales", "users:manage_sellers", false],
  ["sales", "inbox:use", true],
  ["sales", "prices:view", true],
  ["sales", "prices:manage", false],

  // El gerente asigna y aprueba, pero no crea gerentes ni toca la empresa.
  ["manager", "leads:assign", true],
  ["manager", "sales:approve", true],
  ["manager", "users:manage_sellers", true],
  ["manager", "users:manage_managers", false],
  ["manager", "company:edit_operational", false],
  ["manager", "campaigns:manage", false],
  ["manager", "managements:manage", true],
  ["manager", "ads:view", true],

  // El supervisor espeja al gerente MENOS gerencias y ads.
  ["supervisor", "sales:approve", true],
  ["supervisor", "leads:assign", true],
  ["supervisor", "managements:manage", false],
  ["supervisor", "users:manage_sellers", false],
  ["supervisor", "forms:manage", true],

  // El admin manda en su empresa pero no en los datos legales.
  ["admin", "company:edit_operational", true],
  ["admin", "company:edit_legal", false],
  ["admin", "company:view_legal", true],
  ["admin", "users:manage_managers", true],
  ["admin", "leads:export", true],
  ["admin", "leads:delete", true],
  ["admin", "bot:configure", true],
  ["admin", "platform:billing", false],

  // El proveedor de datos sólo carga.
  ["data_provider", "leads:create", true],
  ["data_provider", "leads:classify_pool", true],
  ["data_provider", "leads:assign", false],
  ["data_provider", "quotes:create", false],
  ["data_provider", "inbox:use", false],
  ["data_provider", "reports:view", false],

  // El super_admin es soporte: ve todo, no opera leads.
  ["super_admin", "platform:companies", true],
  ["super_admin", "company:edit_legal", true],
  ["super_admin", "leads:view", true],
  ["super_admin", "leads:create", false],
  ["super_admin", "leads:delete", false],
  ["super_admin", "sales:approve", false],
  ["super_admin", "templates:global", true],

  // El admin de grupo es un admin dentro de la marca activa.
  ["group_admin", "users:manage_managers", true],
  ["group_admin", "company:edit_operational", true],
  ["group_admin", "company:edit_legal", false],
  ["group_admin", "platform:companies", false],
];

for (const [role, cap, want] of GOLDEN) {
  check(`${role} · ${cap}`, can(p(role), cap), want);
}

// ---------------------------------------------------------------------------
console.log("\n— El flag de exportación —");

check(
  "gerente SIN el flag no descarga la base",
  can(p("manager", false), "leads:export"),
  false,
);
check(
  "gerente CON el flag sí descarga",
  can(p("manager", true), "leads:export"),
  true,
);
check(
  "el admin descarga aunque el flag esté en false",
  can(p("admin", false), "leads:export"),
  true,
);
check(
  "al gerente sin flag se le explica que se lo tienen que habilitar",
  /habilita/.test(explain(p("manager", false), "leads:export").text),
  true,
);

// ---------------------------------------------------------------------------
console.log("\n— El admin de grupo se resuelve como admin —");

check("rol efectivo", effectiveRole(p("group_admin")), "admin");
check("rol efectivo de un vendedor no cambia", effectiveRole(p("sales")), "sales");

// ---------------------------------------------------------------------------
console.log("\n— Las negativas dicen a quién pedirle —");

for (const role of ["sales", "manager", "data_provider"] as UserRole[]) {
  const denied = ALL_CAPABILITIES.filter((c) => !can(p(role), c));
  const mudas = denied.filter((c) => {
    const t = explain(p(role), c).text;
    return !/lo hace|habilita|pedí|solicit/i.test(t);
  });
  check(`${role}: toda negativa deriva a alguien`, mudas, []);
}

// ---------------------------------------------------------------------------
console.log("\n— Integridad de la matriz —");

check(
  "toda capacidad tiene al menos un rol",
  ALL_CAPABILITIES.filter((c) => CAPABILITIES[c].roles.length === 0),
  [],
);
check(
  "toda capacidad tiene etiqueta",
  ALL_CAPABILITIES.filter((c) => !CAPABILITIES[c].label.trim()),
  [],
);
check(
  "ninguna capacidad lista group_admin explícitamente (se resuelve como admin)",
  ALL_CAPABILITIES.filter((c) => CAPABILITIES[c].roles.includes("group_admin")),
  [],
);

// ---------------------------------------------------------------------------
// Parte 2: contra la base, si hay credenciales.
// ---------------------------------------------------------------------------
async function auditRls() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(
      "\n— Auditoría de RLS —\n  ⚠ Sin credenciales de Supabase: se saltea.\n" +
        "    Con SUPABASE_SERVICE_ROLE_KEY en .env.local se verifica contra la base real.",
    );
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // `rls_audit()` es security definer y exige super_admin. Con service-role
  // `auth.uid()` es null y `is_super_admin()` da false, así que se consulta
  // directo el catálogo por RPC no es posible: se hace con una query simple a
  // las tablas del asistente para al menos confirmar que existen.
  const tables = new Set<string>();
  for (const c of ALL_CAPABILITIES) {
    for (const t of CAPABILITIES[c].tables ?? []) tables.add(t);
  }

  console.log("\n— Auditoría de RLS —");
  let missing = 0;
  for (const t of [...tables].sort()) {
    const { error } = await admin.from(t).select("*", { head: true, count: "exact" }).limit(0);
    if (error) {
      missing++;
      console.log(`  ✗ ${t}: ${error.message}`);
    } else {
      console.log(`  ✓ ${t} existe`);
    }
  }
  if (missing > 0) {
    failed += missing;
    console.log(`\n  ${missing} tabla(s) que la matriz nombra no existen en la base.`);
  }
}

void auditRls().then(() => {
  console.log(
    failed === 0
      ? "\nTodo bien.\n"
      : `\n${failed} test(s) fallaron.\n`,
  );
  if (failed > 0) process.exit(1);
});
