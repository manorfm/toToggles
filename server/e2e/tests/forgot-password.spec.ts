import { expect, test } from "@playwright/test";
import { readFixtures, ROOT_STATE } from "../fixtures";

// v2.6 §5.5: "esqueci minha senha" sem e-mail — só um pedido que vira um evento de auditoria
// visível a root/admin em History. Sem storageState no browser não-autenticado de propósito: é a
// própria tela de login (pré-sessão) que expõe o link.
test("requesting a password reset from the login screen records an audit event root can see", async ({ browser }) => {
  const fixtures = readFixtures();
  const loggedOutContext = await browser.newContext();
  const loggedOutPage = await loggedOutContext.newPage();

  await loggedOutPage.goto("/login");
  await loggedOutPage.getByRole("button", { name: /forgot password/i }).click();
  await expect(loggedOutPage.getByText("Forgot your password?")).toBeVisible();

  await loggedOutPage.getByLabel(/username/i).fill(fixtures.adminUsername);
  await loggedOutPage.getByRole("button", { name: /request reset/i }).click();

  await expect(loggedOutPage.getByText(/an administrator has been notified/i)).toBeVisible();
  await expect(loggedOutPage.getByText(`@${fixtures.adminUsername}`, { exact: false })).toBeVisible();

  await loggedOutPage.getByRole("button", { name: /done/i }).click();
  // O modal fecha; a tela de login continua intacta por baixo (nenhuma navegação aconteceu).
  await expect(loggedOutPage.getByRole("button", { name: /entrar/i })).toBeVisible();

  // Root vê o pedido em History — evento global (team_id nulo), texto/target confirmados
  // (docs/rest-flow.md §2).
  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const rootPage = await rootContext.newPage();
  await rootPage.goto("/history");
  const entry = rootPage.locator(".audit-item", { hasText: `@${fixtures.adminUsername}` });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText("Password reset requested");
  await expect(entry).toContainText("Self-service (login screen)");

  await loggedOutContext.close();
  await rootContext.close();
});

test("requesting a reset for a username that doesn't exist still shows the same confirmation (no enumeration)", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /forgot password/i }).click();
  await page.getByLabel(/username/i).fill("this-user-does-not-exist");
  await page.getByRole("button", { name: /request reset/i }).click();

  await expect(page.getByText(/an administrator has been notified/i)).toBeVisible();
});
