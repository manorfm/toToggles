import { expect, test } from "@playwright/test";
import { ADMIN_STATE, readFixtures, ROOT_STATE } from "../fixtures";

// v2.6 §6.1/§6.2: command palette (⌘K/Ctrl+K) — busca global entre aplicações, toggles e (só
// pra root) times/pessoas já carregados. Usa Control+k em vez de Meta+k pra funcionar igual em
// qualquer SO de CI (o listener real aceita os dois — metaKey || ctrlKey).
test("root searches and navigates via the command palette across apps, toggles and teams", async ({ browser }) => {
  const fixtures = readFixtures();
  const context = await browser.newContext({ storageState: ROOT_STATE });
  const page = await context.newPage();

  await page.goto("/");
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder("Search applications, toggles, teams, people…");
  await expect(input).toBeVisible();

  await input.fill("E2E App");
  await expect(page.locator(".cmdk-group", { hasText: "Applications" })).toBeVisible();
  await page.getByRole("button", { name: "E2E App" }).click();

  await expect(page).toHaveURL(new RegExp(`/applications/${fixtures.appId}$`));
  await expect(input).not.toBeVisible();

  // Volta pra fora da tela de detalhe antes do próximo salto: ApplicationDetailScreen só lê
  // `?search=`/`?tab=` no MOUNT (mesma característica documentada em favorites.spec.ts para o
  // clique num toggle favoritado da sidebar) — navegar pro mesmo app de novo sem remount não
  // repovoaria o filtro, o que não é o que este teste quer provar.
  await page.goto("/");

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Search applications, toggles, teams, people…").fill(fixtures.togglePath);
  await expect(page.locator(".cmdk-group", { hasText: "Toggles" })).toBeVisible();
  const toggleHit = page.locator(".cmdk-item", { hasText: fixtures.togglePath });
  await expect(toggleHit).toContainText("E2E App");
  await toggleHit.click();

  await expect(page).toHaveURL(new RegExp(`/applications/${fixtures.appId}\\?tab=toggles&search=`));
  await expect(page.getByPlaceholder("Filter paths… e.g. payments.card")).toHaveValue(fixtures.togglePath);

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Search applications, toggles, teams, people…").fill("E2E Team");
  await expect(page.locator(".cmdk-group", { hasText: "Teams" })).toBeVisible();
  await page.getByRole("button", { name: "E2E Team" }).click();

  await expect(page).toHaveURL(/\/teams$/);

  await context.close();
});

// A rota /teams é RequireRoot() no backend (docs/rest-flow.md) — um resultado de time no palette
// pra um admin seria um link morto. Confirma que o gate de papel aplicado em AppShell (que monta
// os dados do palette) realmente esconde o grupo Teams pra quem não é root.
test("an admin's command palette never shows a Teams result", async ({ browser }) => {
  const context = await browser.newContext({ storageState: ADMIN_STATE });
  const page = await context.newPage();

  await page.goto("/");
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Search applications, toggles, teams, people…").fill("E2E Team");

  await expect(page.getByText("No matches.")).toBeVisible();
  await expect(page.getByText("Teams", { exact: true })).not.toBeVisible();

  await context.close();
});
