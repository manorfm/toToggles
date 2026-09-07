import { expect, test } from "@playwright/test";
import { ROOT_STATE, readFixtures } from "../fixtures";

// v2.6 §6.4 era puramente client-side (localStorage), sem endpoint de backend — revertido a
// pedido explícito do usuário: favoritos precisam persistir por conta (GET/POST/DELETE
// /api/profile/favorites, ver docs/rest-flow.md §4), sobrevivendo a logout/login e a trocar de
// navegador/dispositivo, em vez de ficarem presos ao localStorage de um único navegador. O valor
// real de e2e aqui é confirmar que favoritar uma aplicação E um toggle na UI de verdade aparece na
// seção "Favorited" da sidebar, que os dois links de lá navegam pro lugar certo, e que o favorito
// aparece numa sessão nova e independente (login de verdade, não a mesma sessão reaproveitada) —
// o cenário exato que o usuário reportou perder.
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

// Regressão do bug reportado: favoritar num navegador/sessão, e enxergar o mesmo favorito numa
// sessão NOVA e independente (login de verdade via formulário, cookie/token diferente) — o cenário
// exato que localStorage nunca resolveria (preso a um navegador/dispositivo). Importante: NÃO usa
// "Sign out" sobre o contexto de ROOT_STATE — isso apagaria de verdade a sessão compartilhada que
// TODO outro spec deste suite reusa via `storageState: ROOT_STATE` (global-setup.ts a cria uma
// única vez para o run inteiro), quebrando cada teste que rodasse depois deste. Em vez disso, a
// segunda sessão é aberta num contexto totalmente à parte, autenticado pelo formulário de login —
// prova o mesmo ponto (favoritos não vivem em localStorage/memória de uma sessão específica) sem
// destruir a sessão root global.
test("a favorited application shows up in a brand-new, independently logged-in session", async ({ browser }) => {
  const fixtures = readFixtures();
  const context = await browser.newContext({ storageState: ROOT_STATE });
  const page = await context.newPage();

  await page.goto("/");
  await page
    .locator(".card.click", { hasText: "E2E App" })
    .getByRole("button", { name: /^favorite$/i })
    .click();
  await expect(page.getByText("Favorited")).toBeVisible();

  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  await freshPage.goto("/login");
  await freshPage.getByLabel(/usuário/i).fill(fixtures.rootUsername);
  await freshPage.getByLabel(/senha/i).fill(fixtures.rootPassword);
  await freshPage.getByRole("button", { name: /entrar/i }).click();
  await expect(freshPage).toHaveURL("/");

  await expect(freshPage.getByText("Favorited")).toBeVisible();
  await expect(freshPage.locator(".nav-item", { hasText: "E2E App" })).toBeVisible();
  await freshContext.close();

  // Limpa pra qualquer spec futuro, de volta no contexto original.
  await page
    .locator(".card.click", { hasText: "E2E App" })
    .getByRole("button", { name: /^unfavorite$/i })
    .click();
  await expect(page.getByText("Favorited")).not.toBeVisible();

  await context.close();
});
