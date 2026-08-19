/**
 * Test de aislamiento entre grupos de concesionarias.
 *
 * Es la condición para que el rol de admin de grupo pueda existir. El rol tiene
 * escritura completa en todas las marcas de SU grupo, así que una policy que se
 * escape no muestra datos de más: los corrompe. "Creo que está bien" no alcanza.
 *
 * Qué hace:
 *   1. Arma dos grupos con dos marcas cada uno, y un admin de grupo en cada uno.
 *   2. Con la sesión REAL de cada admin (JWT vía login, no service_role) afirma,
 *      tabla por tabla, que no puede LEER nada del otro grupo.
 *   3. Afirma que no puede ESCRIBIR en el otro grupo (insert y update).
 *   4. Afirma que no puede cambiar su marca activa a una marca ajena — ni por la
 *      tabla de estado, ni forzando el id.
 *   5. Afirma que SÍ ve lo suyo (un test de aislamiento que sólo prueba que no ve
 *      nada pasaría con RLS mal armada que niegue todo).
 *   6. Borra todo lo que creó, pase lo que pase.
 *
 * Uso:  pnpm test:groups
 */
import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

loadEnvConfig(process.cwd());

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan credenciales de Supabase en .env.local");
  process.exit(1);
}

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Marca de la corrida: todo lo creado la lleva, para poder limpiar sin dudas.
const TAG = `ziso-${randomBytes(4).toString("hex")}`;

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

type Fixture = {
  groupId: string;
  companyIds: string[];
  branchId: string;
  leadId: string;
  userId: string;
  email: string;
  password: string;
  client: SupabaseClient;
};

const created = {
  groups: [] as string[],
  companies: [] as string[],
  users: [] as string[],
};

/** Crea grupo + 2 marcas + sucursal + lead + admin de grupo logueado. */
async function buildFixture(label: string): Promise<Fixture> {
  const { data: group, error: gErr } = await admin
    .from("groups")
    .insert({ name: `[TEST ${TAG}] Grupo ${label}`, monthly_price: 0 })
    .select("id")
    .single();
  if (gErr) throw gErr;
  created.groups.push(group.id);

  const companyIds: string[] = [];
  for (const brand of ["Marca 1", "Marca 2"]) {
    const { data: c, error } = await admin
      .from("companies")
      .insert({
        name: `[TEST ${TAG}] ${label} ${brand}`,
        group_id: group.id,
        status: "active",
        monthly_price: 0,
      })
      .select("id")
      .single();
    if (error) throw error;
    companyIds.push(c.id);
    created.companies.push(c.id);
  }

  // Sucursal y lead en la PRIMERA marca: son los datos que el otro grupo no
  // tiene que poder tocar.
  const { data: branch, error: bErr } = await admin
    .from("branches")
    .insert({ company_id: companyIds[0], name: `[TEST ${TAG}] Sucursal`, status: "active" })
    .select("id")
    .single();
  if (bErr) throw bErr;

  const { data: lead, error: lErr } = await admin
    .from("leads")
    .insert({
      company_id: companyIds[0],
      branch_id: branch.id,
      first_name: `[TEST ${TAG}]`,
      last_name: label,
      phone: `+5491100${Math.floor(Math.random() * 90000 + 10000)}`,
      status: "new",
    })
    .select("id")
    .single();
  if (lErr) throw lErr;

  // Admin del grupo.
  const email = `${TAG}-${label.toLowerCase()}@example.com`;
  const password = `Test-${randomBytes(9).toString("base64url")}`;
  const { data: user, error: uErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (uErr) throw uErr;
  created.users.push(user.user.id);

  const { error: pErr } = await admin.from("profiles").upsert(
    {
      id: user.user.id,
      company_id: null,
      group_id: group.id,
      role: "group_admin",
      status: "active",
      first_name: "Admin",
      last_name: label,
      terms_accepted_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (pErr) throw pErr;

  // Marca activa = la primera del grupo.
  const { error: sErr } = await admin
    .from("group_admin_state")
    .upsert({ user_id: user.user.id, active_company_id: companyIds[0] });
  if (sErr) throw sErr;

  // Sesión real del usuario: de acá en adelante todo pasa por RLS.
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: authErr } = await client.auth.signInWithPassword({ email, password });
  if (authErr) throw authErr;

  return {
    groupId: group.id,
    companyIds,
    branchId: branch.id,
    leadId: lead.id,
    userId: user.user.id,
    email,
    password,
    client,
  };
}

async function cleanup() {
  console.log("\nLimpieza:");
  // Orden importa: profiles.company_id es RESTRICT, así que primero los users.
  for (const id of created.users) {
    await admin.from("group_admin_state").delete().eq("user_id", id);
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  for (const cid of created.companies) {
    // Todo lo que cuelga de la empresa de prueba.
    await admin.from("lead_notes").delete().eq("company_id", cid);
    await admin.from("lead_tasks").delete().eq("company_id", cid);
    await admin.from("leads").delete().eq("company_id", cid);
    await admin.from("campaigns").delete().eq("company_id", cid);
    await admin.from("branch_product_types").delete().in(
      "branch_id",
      ((await admin.from("branches").select("id").eq("company_id", cid)).data ?? []).map(
        (b) => b.id,
      ),
    );
    await admin.from("branches").delete().eq("company_id", cid);
    await admin.from("product_types").delete().eq("company_id", cid);
    await admin.from("companies").delete().eq("id", cid);
  }
  for (const gid of created.groups) {
    await admin.from("groups").delete().eq("id", gid);
  }
  console.log(
    `  borrados: ${created.users.length} usuario(s), ${created.companies.length} marca(s), ${created.groups.length} grupo(s)`,
  );
}

async function main() {
  console.log(`\nTest de aislamiento entre grupos  (tag ${TAG})\n`);

  const A = await buildFixture("Alfa");
  const B = await buildFixture("Beta");

  // -------------------------------------------------------------------------
  console.log("\n— A ve lo suyo (si esto falla, el test no prueba nada) —");

  const ownCompanies = await A.client.from("companies").select("id, name");
  check(
    "lista las 2 marcas de su grupo",
    (ownCompanies.data ?? []).length === 2 &&
      (ownCompanies.data ?? []).every((c) => A.companyIds.includes(c.id)),
    `vio ${(ownCompanies.data ?? []).length}: ${JSON.stringify(ownCompanies.data)}`,
  );

  const ownLead = await A.client.from("leads").select("id").eq("id", A.leadId);
  check("lee el lead de su marca activa", (ownLead.data ?? []).length === 1);

  const ownWrite = await A.client
    .from("leads")
    .update({ city: "Escribió el dueño" })
    .eq("id", A.leadId)
    .select("id");
  check("puede escribir en su marca activa", (ownWrite.data ?? []).length === 1, ownWrite.error?.message);

  const ownGroup = await A.client.from("groups").select("id");
  check(
    "ve su grupo y sólo el suyo",
    (ownGroup.data ?? []).length === 1 && ownGroup.data![0].id === A.groupId,
  );

  // -------------------------------------------------------------------------
  console.log("\n— A no puede LEER nada del grupo B —");

  const foreign = B.companyIds[0];

  const readTables: { table: string; filter: (q: any) => any }[] = [
    { table: "companies", filter: (q) => q.eq("id", foreign) },
    { table: "leads", filter: (q) => q.eq("company_id", foreign) },
    { table: "branches", filter: (q) => q.eq("company_id", foreign) },
    { table: "profiles", filter: (q) => q.eq("id", B.userId) },
    { table: "campaigns", filter: (q) => q.eq("company_id", foreign) },
    { table: "product_types", filter: (q) => q.eq("company_id", foreign) },
    { table: "sales", filter: (q) => q.eq("company_id", foreign) },
    { table: "lead_notes", filter: (q) => q.eq("company_id", foreign) },
    { table: "lead_tasks", filter: (q) => q.eq("company_id", foreign) },
    { table: "visits", filter: (q) => q.eq("company_id", foreign) },
    { table: "conversations", filter: (q) => q.eq("company_id", foreign) },
    { table: "messages", filter: (q) => q.eq("company_id", foreign) },
    { table: "messaging_channels", filter: (q) => q.eq("company_id", foreign) },
    { table: "bot_configs", filter: (q) => q.eq("company_id", foreign) },
    { table: "bot_intents", filter: (q) => q.eq("company_id", foreign) },
    { table: "lead_interests", filter: (q) => q.eq("company_id", foreign) },
    { table: "sheet_sources", filter: (q) => q.eq("company_id", foreign) },
    { table: "managements", filter: (q) => q.eq("company_id", foreign) },
    { table: "groups", filter: (q) => q.eq("id", B.groupId) },
    { table: "group_admin_state", filter: (q) => q.eq("user_id", B.userId) },
  ];

  for (const { table, filter } of readTables) {
    const res = await filter(A.client.from(table).select("*"));
    const rows = res.data ?? [];
    check(
      `${table}: 0 filas del otro grupo`,
      rows.length === 0,
      `devolvió ${rows.length} fila(s)${res.error ? ` — ${res.error.message}` : ""}`,
    );
  }

  // El lead puntual de B, por id (sin filtro de empresa).
  const foreignLead = await A.client.from("leads").select("*").eq("id", B.leadId);
  check("leads: el lead de B por id no aparece", (foreignLead.data ?? []).length === 0);

  // -------------------------------------------------------------------------
  console.log("\n— A no puede ESCRIBIR en el grupo B —");

  const upd = await A.client
    .from("leads")
    .update({ city: "INTRUSO" })
    .eq("id", B.leadId)
    .select("id");
  check(
    "update sobre un lead de B no afecta ninguna fila",
    (upd.data ?? []).length === 0,
    upd.error?.message,
  );

  const ins = await A.client
    .from("leads")
    .insert({
      company_id: foreign,
      first_name: "INTRUSO",
      phone: "+5491100000001",
      status: "new",
    })
    .select("id");
  check(
    "insert de un lead en una marca de B es rechazado",
    (ins.data ?? []).length === 0 && Boolean(ins.error),
    ins.error ? `error esperado: ${ins.error.code}` : "¡se insertó!",
  );

  const insBranch = await A.client
    .from("branches")
    .insert({ company_id: foreign, name: "INTRUSO", status: "active" })
    .select("id");
  check(
    "insert de sucursal en una marca de B es rechazado",
    (insBranch.data ?? []).length === 0 && Boolean(insBranch.error),
  );

  const updCompany = await A.client
    .from("companies")
    .update({ name: "INTRUSO" })
    .eq("id", foreign)
    .select("id");
  check(
    "update de la empresa de B no afecta ninguna fila",
    (updCompany.data ?? []).length === 0,
  );

  const updProfile = await A.client
    .from("profiles")
    .update({ status: "deleted" })
    .eq("id", B.userId)
    .select("id");
  check(
    "no puede desactivar al admin del otro grupo",
    (updProfile.data ?? []).length === 0,
  );

  const updGroup = await A.client
    .from("groups")
    .update({ name: "INTRUSO" })
    .eq("id", B.groupId)
    .select("id");
  check("no puede editar el grupo de B", (updGroup.data ?? []).length === 0);

  const updOwnGroup = await A.client
    .from("groups")
    .update({ monthly_price: 1 })
    .eq("id", A.groupId)
    .select("id");
  check(
    "no puede editar NI SU PROPIO grupo (el contrato es del SuperAdmin)",
    (updOwnGroup.data ?? []).length === 0,
  );

  // -------------------------------------------------------------------------
  console.log("\n— A no puede robar una marca ajena cambiando su estado —");

  const steal = await A.client
    .from("group_admin_state")
    .update({ active_company_id: foreign })
    .eq("user_id", A.userId)
    .select("active_company_id");
  check(
    "no puede poner como activa una marca de B",
    (steal.data ?? []).length === 0 && Boolean(steal.error),
    steal.error ? `error esperado: ${steal.error.code}` : `quedó ${JSON.stringify(steal.data)}`,
  );

  const stealOther = await A.client
    .from("group_admin_state")
    .update({ active_company_id: A.companyIds[1] })
    .eq("user_id", B.userId)
    .select("user_id");
  check(
    "no puede cambiarle la marca activa a otro usuario",
    (stealOther.data ?? []).length === 0,
  );

  // Después del intento fallido, su estado sigue intacto y sigue viendo lo suyo.
  const stillOwn = await A.client.from("leads").select("id").eq("id", A.leadId);
  check(
    "tras el intento, sigue viendo su propio lead",
    (stillOwn.data ?? []).length === 1,
  );

  // Cambiar a la OTRA marca de SU grupo sí funciona, y mueve lo que ve.
  const switchOk = await A.client
    .from("group_admin_state")
    .update({ active_company_id: A.companyIds[1] })
    .eq("user_id", A.userId)
    .select("active_company_id");
  check(
    "sí puede cambiar a la otra marca de su grupo",
    switchOk.data?.[0]?.active_company_id === A.companyIds[1],
    switchOk.error?.message,
  );

  const afterSwitch = await A.client.from("leads").select("id").eq("id", A.leadId);
  check(
    "con la marca 2 activa ya no ve el lead de la marca 1 (el scope se movió)",
    (afterSwitch.data ?? []).length === 0,
  );

  // -------------------------------------------------------------------------
  // El consolidado no pasa por RLS (usa service_role acotado al grupo), así que
  // se verifica que el acotado esté bien puesto: sólo las marcas del grupo.
  console.log("\n— Consolidado del grupo —");

  const { loadGroupReport } = await import("@/lib/group-report");
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const reportA = await loadGroupReport(A.groupId, { from: monthAgo, to: today });

  check(
    "el consolidado de A trae sus 2 marcas y ninguna más",
    reportA.brands.length === 2 &&
      reportA.brands.every((b) => A.companyIds.includes(b.companyId)),
    `trajo ${reportA.brands.length}: ${reportA.brands.map((b) => b.name).join(", ")}`,
  );
  check(
    "cuenta el lead de la marca 1 en el total del grupo",
    reportA.totals.leads >= 1,
    `leads=${reportA.totals.leads}`,
  );
  const reportB = await loadGroupReport(B.groupId, { from: monthAgo, to: today });
  check(
    "el consolidado de B no incluye ninguna marca de A",
    reportB.brands.every((b) => !A.companyIds.includes(b.companyId)),
  );

  // -------------------------------------------------------------------------
  console.log("\n— Simétrico: B tampoco entra en A —");
  const bIntoA = await B.client.from("leads").select("*").eq("company_id", A.companyIds[0]);
  check("B no lee leads de A", (bIntoA.data ?? []).length === 0);
  const bWriteA = await B.client
    .from("leads")
    .update({ city: "INTRUSO" })
    .eq("id", A.leadId)
    .select("id");
  check("B no escribe en leads de A", (bWriteA.data ?? []).length === 0);
}

main()
  .catch((e) => {
    failed++;
    console.error("\nEXCEPCIÓN:", e instanceof Error ? e.message : e);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("  ¡falló la limpieza!", e));
    console.log(
      failed === 0
        ? `\n${passed} afirmaciones OK — el aislamiento entre grupos se sostiene\n`
        : `\n${failed} FALLARON de ${failed + passed} — NO seguir hasta arreglarlo\n`,
    );
    process.exit(failed === 0 ? 0 : 1);
  });
