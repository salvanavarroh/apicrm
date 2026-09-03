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

  test("el riel está en todas las pantallas y despliega el panel", async ({
    page,
  }) => {
    const launcher = page.getByRole("button", { name: "Abrir el asistente" });
    await expect(launcher).toBeVisible();
    await launcher.click();

    const panel = page.getByRole("dialog", { name: "Agente de API" });
    await expect(panel).toBeVisible();
    // Las sugerencias son el manual de uso: si no están, nadie sabe qué preguntar.
    await expect(
      panel.getByRole("button", { name: /doy de alta una cuenta/i }),
    ).toBeVisible();

    // UN solo chat montado. Con dos (uno mobile y otro desktop) serían dos
    // conversaciones distintas y al cambiar de tamaño se perdía el hilo.
    expect(
      await page.getByPlaceholder("Preguntame algo del CRM…").count(),
    ).toBe(1);

    // Escape cierra.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // Y sigue estando en otra sección.
    await page.goto("/super-admin/companies");
    await expect(
      page.getByRole("button", { name: "Abrir el asistente" }),
    ).toBeVisible();
  });

  test("una incidencia ofrece reportarla, con el texto ya cargado", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Abrir el asistente" }).click();
    const panel = page.getByRole("dialog", { name: "Agente de API" });

    const input = panel.getByPlaceholder("Preguntame algo del CRM…");
    await input.fill("el PDF del presupuesto sale en blanco");
    await input.press("Enter");

    const reportar = panel.getByRole("button", {
      name: /Reportar este problema/i,
    });
    await expect(reportar).toBeVisible({ timeout: 30_000 });
    await reportar.click();

    // El formulario arranca con lo que ya escribió: contarlo dos veces es la
    // forma más segura de que no lo cuente nadie.
    await expect(panel.getByLabel("¿Qué pasó?")).toHaveValue(
      "el PDF del presupuesto sale en blanco",
    );
    // Y el contexto se manda solo.
    await expect(panel.getByText(/Se manda solo/i)).toBeVisible();
  });

  test("navegación: contesta con la ruta y sin llamar al modelo", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Abrir el asistente" }).click();
    const panel = page.getByRole("dialog", { name: "Agente de API" });

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
    const panel = page.getByRole("dialog", { name: "Agente de API" });

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
    const panel = page.getByRole("dialog", { name: "Agente de API" });

    const input = panel.getByPlaceholder("Preguntame algo del CRM…");
    await input.fill("¿cuánto pagamos por el sistema?");
    await input.press("Enter");

    // Deriva a soporte, pero por el botón de reporte: el mail ya no se muestra.
    await expect(panel.getByText(/bot[oó]n/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(panel.getByText(/@cambalache\.studio/i)).toBeHidden();
  });

  // Éste sí llama al modelo y a la base de conocimiento: es el camino completo
  // (recuperación híbrida → generación en streaming → citas). Necesita
  // OPENAI_API_KEY y la base indexada (`pnpm kb:build && pnpm kb:sync`).
  test("producto: responde con la documentación y cita la fuente", async ({
    page,
  }) => {
    test.skip(!process.env.OPENAI_API_KEY, "sin OPENAI_API_KEY");

    await page.getByRole("button", { name: "Abrir el asistente" }).click();
    const panel = page.getByRole("dialog", { name: "Agente de API" });

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

  test("la conversación sobrevive al cierre, al refresh y al cambio de pantalla", async ({
    page,
  }) => {
    const panel = page.getByRole("dialog", { name: "Agente de API" });
    await page.getByRole("button", { name: "Abrir el asistente" }).click();
    const input = panel.getByPlaceholder("Preguntame algo del CRM…");
    await input.fill("¿qué es una gerencia?");
    await input.press("Enter");
    // Que la respuesta llegue ENTERA importa: el bug que motivó este test era
    // que la restauración pisaba la respuesta mientras se estaba escribiendo.
    await expect(panel.getByText("SEGÚN")).toBeVisible({ timeout: 45_000 });

    await panel.getByRole("button", { name: "Cerrar el asistente" }).click();
    await page.getByRole("button", { name: "Abrir el asistente" }).click();
    await expect(panel.getByText("¿qué es una gerencia?")).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Abrir el asistente" }).click();
    await expect(panel.getByText("¿qué es una gerencia?")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/super-admin/companies");
    await page.getByRole("button", { name: "Abrir el asistente" }).click();
    await expect(panel.getByText("¿qué es una gerencia?")).toBeVisible({
      timeout: 15_000,
    });

    // El historial la marca como abierta.
    await panel.getByRole("button", { name: "Conversaciones anteriores" }).click();
    await expect(panel.getByText("· abierta")).toBeVisible();
    await panel.getByRole("button", { name: "Volver" }).click();

    // Y "Nuevo" arranca en blanco, también después de refrescar.
    await panel.getByRole("button", { name: "Nuevo" }).click();
    await expect(panel.getByText("¿qué es una gerencia?")).toBeHidden();
    await page.reload();
    await page.getByRole("button", { name: "Abrir el asistente" }).click();
    await page.waitForTimeout(1500);
    await expect(panel.getByText("¿qué es una gerencia?")).toBeHidden();
  });

  test("decir «gracias» no dispara una derivación a soporte", async ({ page }) => {
    // El caso reportado: el usuario agradeció y el asistente contestó "no tengo
    // información sobre eso, escribí a soporte".
    await page.getByRole("button", { name: "Abrir el asistente" }).click();
    const panel = page.getByRole("dialog", { name: "Agente de API" });
    const input = panel.getByPlaceholder("Preguntame algo del CRM…");

    await input.fill("gracias");
    await input.press("Enter");
    await expect(panel.getByText(/De nada/i)).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText(/no tengo información/i)).toBeHidden();

    await input.fill("¿quién sos?");
    await input.press("Enter");
    await expect(panel.getByText(/Soy el asistente del CRM/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("ninguna respuesta ofrece el mail: el camino es el botón", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Abrir el asistente" }).click();
    const panel = page.getByRole("dialog", { name: "Agente de API" });
    const input = panel.getByPlaceholder("Preguntame algo del CRM…");

    for (const q of [
      "el PDF del presupuesto sale en blanco",
      "¿cómo cargo el stock de repuestos?",
      "¿cuánto pagamos por el sistema?",
    ]) {
      await input.fill(q);
      await input.press("Enter");
      await expect(panel.getByText("Pensando…")).toBeHidden({ timeout: 40_000 });
      await page.waitForTimeout(800);
    }
    const texto = await panel.innerText();
    expect(texto).not.toContain("@cambalache.studio");
    expect(texto).toMatch(/bot[oó]n/i);
  });

  test("el botón Ayuda del menú abre el chat, no una página", async ({
    page,
  }) => {
    // Mandar a alguien que necesita ayuda a leer una página de links es hacerle
    // dar una vuelta de más: el chat contesta la pregunta concreta.
    await page.goto("/super-admin/companies");
    await page.getByRole("button", { name: "Ayuda" }).click();

    await expect(page).toHaveURL(/super-admin\/companies/);
    await expect(
      page.getByRole("dialog", { name: "Agente de API" }),
    ).toBeVisible();
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
