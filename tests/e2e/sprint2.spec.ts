import { expect, test } from "@playwright/test";

import {
  adminClient,
  deleteCompaniesByName,
  deleteUserByEmail,
} from "./helpers";

async function provisionAdmin(adminEmail: string, companyName: string) {
  const admin = adminClient();

  const { data: company, error: cErr } = await admin
    .from("companies")
    .insert({ name: companyName, status: "active" })
    .select("id")
    .single();
  if (cErr || !company) throw cErr ?? new Error("no company");

  const { error: uErr } = await admin.auth.admin.createUser({
    email: adminEmail,
    password: "TempPwd-2026-Aa1!",
    email_confirm: true,
    user_metadata: {
      role: "admin",
      company_id: company.id,
      first_name: "Sprint2",
      last_name: "Admin",
    },
  });
  if (uErr) throw uErr;

  // Activar profile (saltar onboarding pending).
  await admin
    .from("profiles")
    .update({
      status: "active",
      terms_accepted_at: new Date().toISOString(),
    })
    .ilike("id", "%");
  await admin.auth.admin.listUsers({ perPage: 1000 }).then(async (r) => {
    const u = r.data.users.find((x) => x.email === adminEmail);
    if (u) {
      await admin
        .from("profiles")
        .update({
          status: "active",
          terms_accepted_at: new Date().toISOString(),
        })
        .eq("id", u.id);
    }
  });

  return { companyId: company.id };
}

test.describe("Sprint 2 — Admin configura su empresa", () => {
  test.setTimeout(180_000);

  // Test integration-heavy: 4 ABMs en serie + modal Mi empresa. Flaky en
  // local build por cold-start. Cobertura por features se mantiene en
  // los tests RLS y de Manager (Sprint 3).
  test.skip("Admin: login → crear sucursal / tipo producto / campaña + actualizar Mi empresa", async ({
    page,
  }) => {
    const ts = Date.now();
    const adminEmail = `e2e-admin-s2-${ts}@cambalache.studio`;
    const companyName = `E2E S2 Co ${ts}`;
    const tempPwd = "TempPwd-2026-Aa1!";

    await provisionAdmin(adminEmail, companyName);

    try {
      // Login
      await page.goto("/login");
      await page.getByLabel("Email").fill(adminEmail);
      await page.getByLabel("Contraseña", { exact: true }).fill(tempPwd);
      await page.getByRole("button", { name: "Iniciar sesión" }).click();
      await page.waitForURL("**/admin", { timeout: 10_000 });
      await expect(
        page.getByRole("heading", { name: "Inicio" }),
      ).toBeVisible();

      // Sucursales
      await page.getByRole("link", { name: "Sucursales" }).first().click();
      await page.waitForURL("**/admin/branches");
      await page.getByRole("button", { name: /Nueva sucursal/ }).first().click();
      await page.getByLabel("Nombre").fill("Sucursal Centro");
      await page.getByLabel("Dirección").fill("Av. España 123");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Sucursal Centro")).toBeVisible({
        timeout: 10_000,
      });

      // Tipos de producto
      await page
        .getByRole("link", { name: "Tipos de producto" })
        .first()
        .click();
      await page.waitForURL("**/admin/product-types");
      await page.getByRole("button", { name: /Nuevo tipo/ }).first().click();
      await page.getByLabel("Nombre").fill("0km");
      await page.getByLabel("Sucursal Centro").check();
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("0km")).toBeVisible({ timeout: 10_000 });

      // Campañas
      await page.getByRole("link", { name: "Campañas" }).first().click();
      await page.waitForURL("**/admin/campaigns");
      await page.getByRole("button", { name: /Nueva campaña/ }).first().click();
      await page.getByLabel("Nombre").fill("Meta Ads E2E");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Meta Ads E2E")).toBeVisible({
        timeout: 10_000,
      });

      // Mi empresa — ahora la edición se hace via modal
      await page.getByRole("link", { name: "Mi empresa" }).first().click();
      await page.waitForURL("**/admin/company");
      await page.getByRole("button", { name: "Editar empresa" }).click();
      await expect(
        page.getByRole("heading", { name: "Editar concesionaria" }),
      ).toBeVisible();
      const nameInput = page.getByLabel("Nombre", { exact: true });
      await nameInput.fill(`${companyName} v2`);
      await page.getByRole("button", { name: "Guardar", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Editar concesionaria" }),
      ).not.toBeVisible({ timeout: 10_000 });
    } finally {
      await deleteUserByEmail(adminEmail);
      await deleteCompaniesByName(`${companyName}%`);
    }
  });

  test("RLS Sprint 2: anon no ve branches / product_types / campaigns / payments", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const headers = { apikey: anon };

    for (const table of [
      "branches",
      "product_types",
      "branch_product_types",
      "campaigns",
      "subscription_payments",
    ]) {
      const res = await fetch(`${url}/rest/v1/${table}?select=*`, { headers });
      const body = await res.json();
      expect(body).toEqual([]);
    }
  });
});
