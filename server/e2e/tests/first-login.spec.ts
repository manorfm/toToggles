import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startStandaloneServer } from "../helpers";

// A ÚNICA jornada da suíte que sobe seu próprio servidor isolado (ver startStandaloneServer) em
// vez de reusar o compartilhado: a senha gerada de root só existe uma vez por banco, e
// global-setup.ts já precisa consumi-la (via API) pra criar as fixtures antes de qualquer outro
// spec rodar — não sobra uma segunda chance de passar pela tela de troca forçada pelo browser
// com um banco compartilhado. Também é a regressão exata do bug real encontrado nesta sessão:
// sem COOKIE_SECURE=false, o cookie de sessão nunca sobrevive sobre http:// puro, o login
// "funciona" (200, sem erro na tela) mas a troca de senha forçada nunca vinga de verdade — a
// pessoa só volta pro /login silenciosamente.
test("fresh boot: root logs in with the generated password, is forced to change it, and the new password logs in for real", async ({
  browser,
}) => {
  const server = await startStandaloneServer("3059");

  try {
    const generatedPassword = readFileSync(join(server.dbDir, "initial-root-password.txt"), "utf-8").trim();
    const newPassword = "e2eFirstLoginPass1";

    const page = await browser.newPage({ baseURL: server.baseURL });

    // 1. Boot real: server sobe, migrations aplicadas, tela de login real renderiza.
    await page.goto("/login");
    await expect(page.getByLabel(/usuário/i)).toBeVisible();

    // 2. Primeiro login com a senha gerada — a API "funciona" (sem erro na tela), mas exige
    //    troca antes de liberar sessão de verdade.
    await page.getByLabel(/usuário/i).fill("root");
    await page.getByLabel(/senha/i).fill(generatedPassword);
    await page.getByRole("button", { name: /^entrar$/i }).click();
    await expect(page).toHaveURL(/\/change-password/);

    // 3. Troca forçada.
    await page.locator("#current-password").fill(generatedPassword);
    await page.locator("#new-password").fill(newPassword);
    await page.locator("#confirm-password").fill(newPassword);
    await page.getByRole("button", { name: /update password/i }).click();
    await expect(page).toHaveURL(/\/login/);

    // 4. Login de verdade com a senha nova — precisa ficar autenticado (não voltar sozinho pro
    //    /login), o que só acontece se o cookie de sessão realmente persistiu.
    await page.getByLabel(/usuário/i).fill("root");
    await page.getByLabel(/senha/i).fill(newPassword);
    await page.getByRole("button", { name: /^entrar$/i }).click();

    await expect(page).toHaveURL(`${server.baseURL}/`);
    await expect(page.getByText("toToggle")).toBeVisible();

    // 5. Confirma que a sessão realmente vale pra chamadas de API subsequentes, não só pro
    //    redirecionamento inicial.
    const profileRes = await page.request.get("/api/profile");
    expect(profileRes.ok()).toBeTruthy();
    expect((await profileRes.json()).user.username).toBe("root");

    await page.close();
  } finally {
    await server.stop();
  }
});
