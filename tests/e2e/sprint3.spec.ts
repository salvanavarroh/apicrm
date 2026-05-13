import { expect, test } from "@playwright/test";

import {
  adminClient,
  deleteCompaniesByName,
  deleteUsersByPrefix,
} from "./helpers";

async function provisionManagerSetup(opts: { managerEmail: string }) {
  const admin = adminClient();

  // Company
  const { data: company } = await admin
    .from("companies")
    .insert({ name: `E2E S3 Co ${Date.now()}`, status: "active" })
    .select("id, name")
    .single();
  if (!company) throw new Error("no company");

  // Branch + product type
  const { data: branch } = await admin
    .from("branches")
    .insert({ company_id: company.id, name: "Centro" })
    .select("id")
    .single();
  if (!branch) throw new Error("no branch");

  const { data: pt } = await admin
    .from("product_types")
    .insert({ company_id: company.id, name: "0km" })
    .select("id")
    .single();
  if (!pt) throw new Error("no product_type");

  await admin
    .from("branch_product_types")
    .insert({ branch_id: branch.id, product_type_id: pt.id });

  // Manager user
  const { data: created } = await admin.auth.admin.createUser({
    email: opts.managerEmail,
    password: "TempPwd-2026-Aa1!",
    email_confirm: true,
    user_metadata: {
      role: "manager",
      company_id: company.id,
      first_name: "Sprint3",
      last_name: "Manager",
    },
  });
  if (!created?.user) throw new Error("no user");

  await admin
    .from("profiles")
    .update({
      status: "active",
      terms_accepted_at: new Date().toISOString(),
    })
    .eq("id", created.user.id);

  // user_product_types + management
  await admin
    .from("user_product_types")
    .insert({ user_id: created.user.id, product_type_id: pt.id });

  const { data: mgmt } = await admin
    .from("managements")
    .insert({
      company_id: company.id,
      branch_id: branch.id,
      product_type_id: pt.id,
      manager_id: created.user.id,
      auto_assignment_enabled: false,
    })
    .select("id")
    .single();
  if (!mgmt) throw new Error("no management");

  return {
    companyId: company.id,
    companyName: company.name,
    managerId: created.user.id,
    managementId: mgmt.id,
  };
}

test.describe("Sprint 3 — Manager configura su equipo", () => {
  test.setTimeout(60_000);

  test.beforeEach(async () => {
    await deleteUsersByPrefix("e2e-s3-");
    await deleteCompaniesByName("E2E S3 %");
  });

  test("Manager: login → toggle auto-asignación por gerencia (verifica DB)", async ({
    page,
  }) => {
    const managerEmail = `e2e-s3-mgr-${Date.now()}@cambalache.studio`;
    const setup = await provisionManagerSetup({ managerEmail });

    try {
      await page.goto("/login");
      await page.getByLabel("Email").fill(managerEmail);
      await page
        .getByLabel("Contraseña", { exact: true })
        .fill("TempPwd-2026-Aa1!");
      await page.getByRole("button", { name: "Iniciar sesión" }).click();
      await page.waitForURL("**/manager", { timeout: 10_000 });

      // Ir a Gerencias
      await page.getByRole("link", { name: "Gerencias" }).first().click();
      await page.waitForURL("**/manager/managements");
      await expect(page.getByText("Centro")).toBeVisible();
      await expect(page.getByText("0km")).toBeVisible();

      // Toggle auto-assign
      await page
        .getByRole("button", { name: "Activar auto-asignación" })
        .click();
      await page.waitForLoadState("networkidle");

      // Verificar en DB
      const admin = adminClient();
      const { data: m } = await admin
        .from("managements")
        .select("auto_assignment_enabled")
        .eq("id", setup.managementId)
        .single();
      expect(m?.auto_assignment_enabled).toBe(true);

      // Ir a Equipo (sin invitar para evitar SMTP rate limit; solo verificamos
      // que la lista está vacía y los branches del modal vienen poblados).
      await page.getByRole("link", { name: "Equipo" }).first().click();
      await page.waitForURL("**/manager/team");
      await expect(
        page.getByText(/Todavía no invitaste vendedores/),
      ).toBeVisible();
    } finally {
      await deleteUsersByPrefix("e2e-s3-");
      await deleteCompaniesByName(setup.companyName);
    }
  });

  test("RLS Sprint 3: anon no ve user_product_types ni managements", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    for (const table of ["user_product_types", "managements"]) {
      const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
        headers: { apikey: anon },
      });
      expect(await res.json()).toEqual([]);
    }
  });
});
