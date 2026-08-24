import { test, expect } from "@playwright/test";

/**
 * Auditoría mobile: recorre las pantallas principales en un iPhone y verifica lo
 * único que se puede verificar de forma objetiva sobre responsive —que la página
 * NO scrollee horizontalmente— además de dejar capturas para revisar a ojo.
 *
 * El scroll horizontal es la mejor señal automática que existe acá: casi todos
 * los problemas de mobile (una tabla ancha, un panel de ancho fijo, un grid que
 * no colapsa) terminan empujando el `body` más allá del viewport.
 *
 * Uso:  pnpm test:mobile
 */

const EMAIL = process.env.QA_ADMIN_EMAIL ?? "apicrmai+cambalache@gmail.com";
const PASSWORD = process.env.QA_ADMIN_PASSWORD ?? "";

const SCREENS: { path: string; name: string }[] = [
  { path: "/admin", name: "inicio" },
  { path: "/admin/leads", name: "leads" },
  { path: "/admin/inbox", name: "inbox" },
  { path: "/admin/sales", name: "ventas" },
  { path: "/admin/tasks-visits", name: "tareas" },
  { path: "/admin/reports", name: "informe-ejecutivo" },
  { path: "/admin/reportes", name: "reportes" },
  { path: "/admin/ads", name: "ads" },
  { path: "/admin/bot", name: "bot" },
  { path: "/admin/valuations", name: "cotizador" },
  { path: "/admin/users", name: "usuarios" },
  { path: "/admin/branches", name: "sucursales" },
  { path: "/admin/company", name: "empresa" },
  { path: "/ayuda", name: "ayuda" },
];

// Viewport de iPhone 13 sobre Chromium: el proyecto sólo tiene ese navegador
// instalado y para auditar layout alcanza — lo que se mide es ancho, no motor.
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

test.describe("mobile", () => {
  test.skip(!PASSWORD, "Falta QA_ADMIN_PASSWORD");
  // 14 pantallas, algunas con datos remotos: el default de 30s no alcanza.
  test.setTimeout(300_000);

  test("las pantallas no scrollean en horizontal", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await page.waitForURL(/\/(admin|manager|sales)/, { timeout: 30_000 });

    const overflowing: string[] = [];

    for (const screen of SCREENS) {
      await page.goto(screen.path, { waitUntil: "domcontentloaded" });
      // Las pantallas con datos remotos tardan; alcanza con que pinte algo.
      await page.waitForTimeout(2500);

      const { scrollW, clientW } = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      // 1px de tolerancia por redondeos de subpíxel.
      if (scrollW > clientW + 1) {
        overflowing.push(`${screen.name} (${scrollW}px > ${clientW}px)`);
      }

      await page.screenshot({
        path: `test-results/mobile/${screen.name}.png`,
        fullPage: false,
      });
    }

    // El inbox con un chat ABIERTO es un caso aparte: es otra pantalla en
    // mobile (la lista se oculta) y es donde estaba el desborde del header.
    await page.goto("/admin/inbox", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const row = page.locator('[data-conversation-row]').first();
    if (await row.count()) {
      await row.click();
      await page.waitForTimeout(1500);
      const { scrollW, clientW } = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      if (scrollW > clientW + 1) {
        overflowing.push(`inbox-chat (${scrollW}px > ${clientW}px)`);
      }
      await page.screenshot({ path: "test-results/mobile/inbox-chat.png" });
    }

    expect(overflowing, `Pantallas con scroll horizontal:\n${overflowing.join("\n")}`).toEqual([]);
  });

  test("el menú se abre y se cierra desde la barra superior", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await page.waitForURL(/\/(admin|manager|sales)/, { timeout: 30_000 });

    // Cerrado: el menú está fuera de pantalla.
    const aside = page.locator("aside").first();
    const before = await aside.boundingBox();
    expect(before?.x ?? 0).toBeLessThan(0);

    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.waitForTimeout(400);
    const after = await aside.boundingBox();
    expect(after?.x ?? -1).toBeGreaterThanOrEqual(0);

    await page.screenshot({ path: "test-results/mobile/menu-abierto.png" });

    // Al elegir una opción, el cajón se cierra solo.
    await page.locator('aside a[href="/admin/leads"]').first().click();
    await page.waitForTimeout(600);
    const closed = await aside.boundingBox();
    expect(closed?.x ?? 0).toBeLessThan(0);
  });
});
