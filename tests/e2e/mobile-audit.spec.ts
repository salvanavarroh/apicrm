import { test, expect } from "@playwright/test";

/**
 * Auditoría mobile: recorre las pantallas principales en un iPhone y verifica lo
 * único que se puede verificar de forma objetiva sobre responsive —que la página
 * NO scrollee horizontalmente— además de dejar capturas para revisar a ojo.
 *
 * El scroll horizontal es la mejor señal automática que existe acá: casi todos
 * los problemas de mobile (una tabla ancha, un panel de ancho fijo, un grid que
 * no colapsa) terminan empujando el contenido más allá del viewport.
 *
 * OJO con dónde se mide. El que scrollea es `<main>`, no el documento: tiene
 * `overflow-y-auto`, y en CSS eso convierte también el eje X en `auto`. O sea
 * que una pantalla puede desbordar 150px hacia el costado con
 * `document.documentElement.scrollWidth === clientWidth`. Es exactamente lo que
 * pasaba con el informe ejecutivo y con respuesta automática: se veían bien
 * quietas y se iban al costado al scrollear. Por eso se miden las dos cajas.
 *
 * Uso:  pnpm test:mobile
 */

const EMAIL = process.env.QA_ADMIN_EMAIL ?? "apicrmai+cambalache@gmail.com";
const PASSWORD = process.env.QA_ADMIN_PASSWORD ?? "";

const SCREENS: { path: string; name: string }[] = [
  { path: "/admin", name: "inicio" },
  { path: "/admin/leads", name: "leads" },
  { path: "/admin/leads/pool", name: "leads-pool" },
  { path: "/admin/inbox", name: "inbox" },
  { path: "/admin/sales", name: "ventas" },
  { path: "/admin/tasks-visits", name: "tareas" },
  { path: "/admin/reports", name: "informe-ejecutivo" },
  { path: "/admin/reportes", name: "reportes" },
  { path: "/admin/ads", name: "ads" },
  { path: "/admin/campaigns", name: "campanas" },
  { path: "/admin/forms", name: "formularios" },
  { path: "/admin/sheets", name: "sheets" },
  { path: "/admin/bot", name: "bot" },
  { path: "/admin/valuations", name: "cotizador" },
  { path: "/admin/prices", name: "precios" },
  { path: "/admin/product-types", name: "tipos-producto" },
  { path: "/admin/users", name: "usuarios" },
  { path: "/admin/branches", name: "sucursales" },
  { path: "/admin/channels", name: "canales" },
  { path: "/admin/whatsapp-templates", name: "plantillas-wa" },
  { path: "/admin/lead-ads", name: "lead-ads" },
  { path: "/admin/integraciones", name: "integraciones" },
  { path: "/admin/company", name: "empresa" },
  { path: "/profile", name: "perfil" },
  { path: "/ayuda", name: "ayuda" },
];

/** Mide las dos cajas que pueden scrollear: el documento y el `<main>`. */
async function overflowOf(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const main = document.querySelector("main");
    return {
      docScroll: doc.scrollWidth,
      docClient: doc.clientWidth,
      mainScroll: main?.scrollWidth ?? 0,
      mainClient: main?.clientWidth ?? 0,
    };
  });
}

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
  // 25 pantallas, algunas con datos remotos: el default de 30s no alcanza.
  test.setTimeout(600_000);

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

      const m = await overflowOf(page);
      // 1px de tolerancia por redondeos de subpíxel.
      if (m.docScroll > m.docClient + 1) {
        overflowing.push(
          `${screen.name} — documento (${m.docScroll}px > ${m.docClient}px)`,
        );
      }
      if (m.mainScroll > m.mainClient + 1) {
        overflowing.push(
          `${screen.name} — main (${m.mainScroll}px > ${m.mainClient}px)`,
        );
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
      const m = await overflowOf(page);
      if (m.docScroll > m.docClient + 1) {
        overflowing.push(
          `inbox-chat — documento (${m.docScroll}px > ${m.docClient}px)`,
        );
      }
      if (m.mainScroll > m.mainClient + 1) {
        overflowing.push(`inbox-chat — main (${m.mainScroll}px > ${m.mainClient}px)`);
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
