import { expect, test } from "@playwright/test";
import { ADMIN_STATE, readFixtures, ROOT_STATE } from "../fixtures";
import { ensureSwitchOff, ensureSwitchOn, goToApprovalSettings } from "../helpers";

// Reusa a aplicação compartilhada — o botão mostra "Generate key" (nenhuma chave ainda) ou
// "Regenerate" (já existe uma, ex. de approval-secret-key-delete.spec.ts rodando antes numa
// suite completa) dependendo do que outro spec já fez neste mesmo servidor/banco. O regex cobre
// os dois rótulos de propósito, pra não depender da ordem de execução dos arquivos.
const GENERATE_OR_REGENERATE = /generate key|regenerate/i;

test.describe("secret key — generate/regenerate", () => {
  test("without approval: applies immediately and shows the reveal-once modal", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await goToApprovalSettings(rootPage);
    await ensureSwitchOff(rootPage.getByRole("button", { name: "Sistema de aprovação" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/applications/${fixtures.appId}`);
    const secretKeySection = adminPage.locator("#service-key-section");
    await secretKeySection.getByRole("button", { name: GENERATE_OR_REGENERATE }).click();

    await expect(adminPage.getByText("Service key generated")).toBeVisible();
    await expect(adminPage.locator(".skey-val")).toContainText("sk_");
    await adminPage.locator(".skey-ack input[type=checkbox]").check();
    await adminPage.getByRole("button", { name: /I've saved the key/i }).click();

    await expect(secretKeySection.getByRole("button", { name: "Regenerate" })).toBeVisible();
    await expect(secretKeySection.getByRole("button", { name: "Delete", exact: true })).toBeVisible();

    await rootContext.close();
    await adminContext.close();
  });

  test("with approval: pending until root approves, then a key exists", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await goToApprovalSettings(rootPage);
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Sistema de aprovação" }));
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Generate secret key" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/applications/${fixtures.appId}`);
    const secretKeySection = adminPage.locator("#service-key-section");
    await secretKeySection.getByRole("button", { name: GENERATE_OR_REGENERATE }).click();

    await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();
    await expect(adminPage.getByText("Service key generated")).toHaveCount(0); // não revelou nenhuma chave

    await rootPage.goto("/approvals");
    await rootPage.getByRole("button", { name: "Pending" }).click();
    const pendingRow = rootPage.locator(".appr-row", { hasText: "Generate secret key" });
    await expect(pendingRow).toBeVisible();
    await pendingRow.getByRole("button", { name: "Approve" }).click();
    await expect(pendingRow).toHaveCount(0);

    // A chave em si nunca é exposta pro admin depois (foi gerada de forma assíncrona, fora da
    // sessão dele) — só confirmamos que agora existe uma (docs/rest-flow.md: plain_key só existe
    // na resposta síncrona de quem gera).
    await adminPage.reload();
    await expect(secretKeySection.getByRole("button", { name: "Regenerate" })).toBeVisible();

    await rootContext.close();
    await adminContext.close();
  });
});
