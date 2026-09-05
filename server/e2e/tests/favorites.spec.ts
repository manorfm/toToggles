import { expect, test } from "@playwright/test";
import { ROOT_STATE, readFixtures } from "../fixtures";

// v2.6 §6.4: favoritos são puramente client-side (localStorage), sem endpoint de backend — o
// valor real de e2e aqui é confirmar que favoritar uma aplicação E um toggle na UI de verdade
// aparece na seção "Favorited" da sidebar e que os dois links de lá navegam pro lugar certo.
test("favoriting an application and a toggle shows them in the sidebar and navigates correctly", async ({ browser }) => {
  const fixtures = readFixtures();
  const context = await browser.newContext({ storageState: ROOT_STATE });
  const page = await context.newPage();

  await page.goto("/");
  await page
    .locator(".card.click", { hasText: "E2E App" })
    .getByRole("button", { name: /^favorite$/i })
    .click();

  await expect(page.getByText("Favorited")).toBeVisible();
  const favAppItem = page.locator(".nav-item", { hasText: "E2E App" });
  await expect(favAppItem).toBeVisible();

  await page.goto(`/applications/${fixtures.appId}`);
  await page
    .locator(".tg-card", { hasText: fixtures.togglePath })
    .getByRole("button", { name: /^favorite$/i })
    .click();
  await expect(page.getByRole("button", { name: /^unfavorite$/i })).toBeVisible();

  // Volta pra fora da tela de detalhe (onde a sub-nav some) pra confirmar que o item de toggle
  // favoritado está mesmo na navegação principal, não só um efeito visual momentâneo daquela tela.
  await page.goto("/");
  const favToggleItem = page.locator(".nav-item", { hasText: fixtures.togglePath });
  await expect(favToggleItem.first()).toBeVisible();

  // Clicar no toggle favoritado navega pra aplicação certa com o filtro já preenchido.
  await favToggleItem.first().click();
  await expect(page).toHaveURL(new RegExp(`/applications/${fixtures.appId}\\?tab=toggles&search=`));
  await expect(page.getByPlaceholder("Filter paths… e.g. payments.card")).toHaveValue(fixtures.togglePath);

  // Desfavoritar os dois deixa a suíte compartilhada limpa pra qualquer spec futuro.
  await page
    .locator(".tg-card", { hasText: fixtures.togglePath })
    .getByRole("button", { name: /^unfavorite$/i })
    .click();
  await page.goto("/");
  await page
    .locator(".card.click", { hasText: "E2E App" })
    .getByRole("button", { name: /^unfavorite$/i })
    .click();
  await expect(page.getByText("Favorited")).not.toBeVisible();

  await context.close();
});
