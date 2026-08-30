import { expect, test } from "@playwright/test";
import { ADMIN_STATE, readFixtures, ROOT_STATE } from "../fixtures";
import { ensureSwitchOn } from "../helpers";

// Mesma jornada de approval-toggle-enable.spec.ts, mas pra secret_key_delete — o tipo que expôs
// o bug real em SecretKeySection (api/secretKeys.ts não tratava 202/approval_required antes
// desta mudança). Sem esta correção, o clique em "Delete" abaixo quebraria a tela em vez de
// mostrar o aviso de pendência.
test("secret_key_delete is intercepted, shown to the approver, and applied after approval", async ({ browser }) => {
  const fixtures = readFixtures();

  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const rootPage = await rootContext.newPage();

  // Root sempre passa pelo approval workflow (bypass) — gera a chave de teste direto por API,
  // sem depender do estado de aprovação configurado nesta run.
  const generateRes = await rootContext.request.post(`/api/applications/${fixtures.appId}/generate-secret`);
  expect(generateRes.ok()).toBeTruthy();

  await rootPage.goto("/approvals");
  await rootPage.getByRole("button", { name: "Settings" }).click();
  await ensureSwitchOn(rootPage.getByRole("button", { name: "Sistema de aprovação" }));
  await ensureSwitchOn(rootPage.getByRole("button", { name: "Delete secret key" }));

  // Admin tenta apagar a chave — deve ser interceptado, não aplicado.
  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const adminPage = await adminContext.newPage();

  // Escopado a #service-key-section: ToggleCard também tem um botão "Delete" (ícone de
  // lixeira da folha), ambíguo se buscado na página inteira.
  await adminPage.goto(`/applications/${fixtures.appId}`);
  const secretKeySection = adminPage.locator("#service-key-section");
  const deleteKeyButton = secretKeySection.getByRole("button", { name: "Delete", exact: true });
  await expect(deleteKeyButton).toBeVisible();
  await deleteKeyButton.click();

  await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();
  await expect(deleteKeyButton).toBeVisible(); // não removeu de verdade

  // Root vê e aprova.
  await rootPage.goto("/approvals");
  await rootPage.getByRole("button", { name: "Pending" }).click();

  const pendingRow = rootPage.locator(".appr-row", { hasText: "Delete secret key" });
  await expect(pendingRow).toBeVisible();
  await pendingRow.getByRole("button", { name: "Approve" }).click();
  await expect(pendingRow).toHaveCount(0);

  // Admin recarrega e vê a chave realmente apagada (volta ao empty state).
  await adminPage.reload();
  await expect(adminPage.getByText(/nenhuma chave/i)).toBeVisible();

  await rootContext.close();
  await adminContext.close();
});
