import { expect, test } from "@playwright/test";

test("home renderiza el hero del Sprint 0", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "API — CRM" })).toBeVisible();
  await expect(page.getByText("Sprint 0", { exact: true })).toBeVisible();
});
