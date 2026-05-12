import { expect, test } from "@playwright/test";

import {
  adminClient,
  deleteCompaniesByName,
  deleteUserByEmail,
  superAdminCredentials,
} from "./helpers";

test.describe("Sprint 1 — SuperAdmin crea empresa + Admin acepta invitación", () => {
  test("SuperAdmin: login → crear empresa → ver en la lista", async ({
    page,
  }) => {
    const { email, password } = superAdminCredentials();
    const ts = Date.now();
    const companyName = `E2E Concesionaria ${ts}`;
    const adminEmail = `e2e-admin-${ts}@cambalache.studio`;

    // Login
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL("**/super-admin", { timeout: 10_000 });

    // Crear empresa
    await page.getByRole("link", { name: "Nueva empresa" }).first().click();
    await page.waitForURL("**/super-admin/companies/new");

    await page.getByLabel("Nombre comercial *").fill(companyName);
    await page.getByLabel("Email del Admin *").fill(adminEmail);
    await page.getByLabel("Nombre *", { exact: true }).fill("E2E");
    await page.getByLabel("Apellido *").fill("Admin");

    await page
      .getByRole("button", { name: "Crear empresa e invitar Admin" })
      .click();

    await page.waitForURL(/\/super-admin(\?|$)/, { timeout: 15_000 });
    await expect(page.getByText(companyName, { exact: false })).toBeVisible({
      timeout: 10_000,
    });

    // Logout (limpieza de sesión para el siguiente test)
    await page.getByRole("button", { name: "Salir" }).click();
    await page.waitForURL("**/login");

    // Cleanup
    await deleteUserByEmail(adminEmail);
    await deleteCompaniesByName(`${companyName}`);
  });

  test("Admin invitado: login con password temp → acepta invitación → /dashboard", async ({
    page,
  }) => {
    const admin = adminClient();
    const ts = Date.now();
    const adminEmail = `e2e-accept-${ts}@cambalache.studio`;
    const tempPwd = `TempPwd-${ts}-Aa1!`;
    const newPwd = `NewPwd-${ts}-Aa1!`;
    const companyName = `E2E Accept Co ${ts}`;

    // Setup: empresa + user pending vía service_role
    const { data: company, error: cErr } = await admin
      .from("companies")
      .insert({ name: companyName, status: "pending" })
      .select("id")
      .single();
    if (cErr || !company) throw cErr ?? new Error("no company");

    const { error: uErr } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: tempPwd,
      email_confirm: true,
      user_metadata: {
        role: "admin",
        company_id: company.id,
        first_name: "Pending",
        last_name: "Admin",
      },
    });
    if (uErr) throw uErr;

    // El trigger handle_new_auth_user ya creó el profile con status=pending.

    try {
      // Login UI con password temp
      await page.goto("/login");
      await page.getByLabel("Email").fill(adminEmail);
      await page.getByLabel("Contraseña").fill(tempPwd);
      await page.getByRole("button", { name: "Entrar" }).click();

      // Pending → redirige a /auth/accept-invitation
      await page.waitForURL("**/auth/accept-invitation", { timeout: 10_000 });
      await expect(page.getByText(/Bienvenido/)).toBeVisible();

      // Aceptar invite
      await page.getByLabel("Nueva contraseña").fill(newPwd);
      await page.getByLabel("Repetir contraseña").fill(newPwd);
      await page.getByLabel(/Acepto los/).check();

      await page.getByRole("button", { name: "Activar cuenta" }).click();

      // Admin → /dashboard
      await page.waitForURL("**/dashboard", { timeout: 10_000 });
      await expect(page.getByText(/admin/i).first()).toBeVisible();
    } finally {
      // Cleanup
      await deleteUserByEmail(adminEmail);
      await deleteCompaniesByName(companyName);
    }
  });

  test("RLS: anon sin sesión no ve companies ni profiles", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const c = await fetch(`${url}/rest/v1/companies?select=id`, {
      headers: { apikey: anon },
    });
    const p = await fetch(`${url}/rest/v1/profiles?select=id`, {
      headers: { apikey: anon },
    });

    expect(await c.json()).toEqual([]);
    expect(await p.json()).toEqual([]);
  });
});
