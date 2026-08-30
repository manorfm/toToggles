import { expect, test } from "@playwright/test";
import { readFixtures } from "../fixtures";

// Prova que o processo real (main.go compilado via `go run`, não o harness de teste do Go) sobe
// de verdade: migrations aplicadas num SQLite novo, sessão root utilizável, frontend real
// buildado servido pela mesma origem, cookie de sessão sobrevivendo sobre http:// puro
// (COOKIE_SECURE=false). Não repete a tela de troca de senha forçada aqui: a senha gerada de
// root só existe uma vez, e global-setup já precisa consumi-la (via API) pra poder criar as
// fixtures (time/app/toggle/admin) antes de qualquer teste rodar — não há uma segunda senha de
// root pra uma segunda passada pela tela via browser. Esse fluxo já é exercitado de ponta a
// ponta contra o servidor real em global-setup.ts, só que por API em vez de clique.
test("app boots and serves a real login that authenticates root", async ({ page }) => {
  const fixtures = readFixtures();

  await page.goto("/login");
  await expect(page.getByLabel(/usuário/i)).toBeVisible();

  await page.getByLabel(/usuário/i).fill(fixtures.rootUsername);
  await page.getByLabel(/senha/i).fill(fixtures.rootPassword);
  await page.getByRole("button", { name: /entrar/i }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("toToggle")).toBeVisible();
});
