import { expect, test } from "@playwright/test";

import { superAdminCredentials } from "./helpers";

/**
 * E2E del asistente.
 *
 * Se apoya a propósito en las rutas DETERMINISTAS (permisos, navegación y las
 * derivaciones): no necesitan OPENAI_API_KEY ni la base de conocimiento
 * indexada, así que el test es estable y no cuesta plata. La ruta de producto
 * —la que sí llama al modelo— se cubre en `pnpm test:assistant` con el golden
 * set, que mide recuperación sin depender del navegador.
 *
 * Lo que verifica de punta a punta: sesión → layout → widget → POST
 * /api/assistant/chat (SSE) → ruteador → herramienta → respuesta en pantalla.
 */
test.describe("Asistente del CRM", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    const { email, password } = superAdminCredentials();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await page.waitForURL("**/super-admin", { timeout: 20_000 });
  });

  test("el widget está en todas las pantallas y abre", async ({ page }) => {
    const launcher = page.getByRole("button", { name: "Abrir el asistente" });
    await expect(launcher).toBeVisible();
    await launcher.click();

    const panel = page.getByRole("dialog", { name: "Asistente del CRM" });
    await expect(panel).toBeVisible();
    // Las sugerencias son el manual de uso: si no están, nadie sabe qué preguntar.
    await expect(
      panel.getByRole("button", { name: /doy de alta una cuenta/i }),
    ).toBeVisible();

    // Escape cierra.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // Y sigue estando en otra sección.
    await page.goto("/super-admin/companies");
    await expect(
      page.getByRole("button", { name: "Abrir el asistente" }),
    ).toBeVisible();
  });

  test("navegación: contesta con la ruta y sin llamar al modelo", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Abrir el asistente" }).click();
    const panel = page.getByRole("dialog", { name: "Asistente del CRM" });

    const input = panel.getByPlaceholder("Preguntame algo del CRM…");
    await input.fill("¿dónde está la facturación?");
    await input.press("Enter");

    // La respuesta es determinista: sale del menú del rol.
    await expect(panel.getByText("/super-admin/billing").first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("permisos: explica y deriva a quien corresponde", async ({ page }) => {
    await page.getByRole("button", { name: "Abrir el asistente" }).click();
    const panel = page.getByRole("dialog", { name: "Asistente del CRM" });

    const input = panel.getByPlaceholder("Preguntame algo del CRM…");
    await input.fill("¿por qué no puedo aprobar una venta?");
    await input.press("Enter");

    // El super_admin NO aprueba ventas: la respuesta tiene que decirlo y decir
    // quién sí puede.
    await expect(
      panel.getByText(/no, con tu rol no se puede/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("la plata de la plataforma se deriva a soporte", async ({ page }) => {
    await page.getByRole("button", { name: "Abrir el asistente" }).click();
    const panel = page.getByRole("dialog", { name: "Asistente del CRM" });

    const input = panel.getByPlaceholder("Preguntame algo del CRM…");
    await input.fill("¿cuánto pagamos por el sistema?");
    await input.press("Enter");

    await expect(
      panel.getByText(/hello@cambalache\.studio/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  // Éste sí llama al modelo y a la base de conocimiento: es el camino completo
  // (recuperación híbrida → generación en streaming → citas). Necesita
  // OPENAI_API_KEY y la base indexada (`pnpm kb:build && pnpm kb:sync`).
  test("producto: responde con la documentación y cita la fuente", async ({
    page,
  }) => {
    test.skip(!process.env.OPENAI_API_KEY, "sin OPENAI_API_KEY");

    await page.getByRole("button", { name: "Abrir el asistente" }).click();
    const panel = page.getByRole("dialog", { name: "Asistente del CRM" });

    const input = panel.getByPlaceholder("Preguntame algo del CRM…");
    await input.fill("¿cómo funciona la asignación automática de leads?");
    await input.press("Enter");

    // La cita es lo que hace auditable la respuesta: si no aparece, el
    // asistente contestó sin fuente y eso es exactamente lo que no queremos.
    await expect(panel.getByText("Según", { exact: true })).toBeVisible({
      timeout: 45_000,
    });
    await expect(panel.getByText(/Sistema y reglas/i).first()).toBeVisible();
  });

  test("la página de Ayuda es el asistente y manda con Enter", async ({
    page,
  }) => {
    await page.goto("/ayuda");
    await expect(
      page.getByRole("heading", { name: "Ayuda", level: 1 }),
    ).toBeVisible();

    // No alcanza con que el campo exista: tiene que MANDAR. Enter envía y
    // Shift+Enter hace salto de línea, que es lo que espera cualquiera que haya
    // usado un chat.
    const input = page.getByPlaceholder("Preguntame algo del CRM…");
    await input.fill("¿por qué no puedo aprobar una venta?");
    await input.press("Enter");

    // Si el handler no corriera, el texto quedaría en el campo con un \n.
    await expect(input).toHaveValue("");
    await expect(
      page.getByText(/no, con tu rol no se puede/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("la base de conocimiento tiene su pantalla", async ({ page }) => {
    await page.goto("/super-admin/kb");
    await expect(
      page.getByRole("heading", { name: "Base de conocimiento", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Preguntas sin respuesta" }),
    ).toBeVisible();
  });

  test("el endpoint rechaza a quien no tiene sesión", async ({ request }) => {
    const res = await request.post("/api/assistant/chat", {
      data: { question: "hola" },
      headers: { "Content-Type": "application/json" },
      // Sin cookies de sesión.
      ignoreHTTPSErrors: true,
    });
    expect([401, 403]).toContain(res.status());
  });
});
