import { expect, test } from "@playwright/test";
import { ADMIN_STATE, readFixtures, ROOT_STATE } from "../fixtures";
import { confirmApprovalIntercept, ensureSwitchOn } from "../helpers";

// A jornada completa: alguém (admin) tenta ligar um toggle, a ação exige aprovação, o
// aprovador (root) vê e aprova, e o efeito realmente aparece depois — navegando de verdade,
// não chamando a API por baixo dos panos (exceto a etapa 1, que é a própria configuração do
// workflow, também feita clicando na tela real de Settings).
test("toggle_enable is intercepted, shown to the approver, and applied after approval", async ({ browser }) => {
  const fixtures = readFixtures();

  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const rootPage = await rootContext.newPage();

  // 1. Root liga o workflow e exige aprovação pra "Enable toggle".
  await rootPage.goto("/approvals");
  await rootPage.getByRole("button", { name: "Settings" }).click();

  const masterSwitch = rootPage.getByRole("button", { name: "Sistema de aprovação" });
  await ensureSwitchOn(masterSwitch);
  const enableSwitch = rootPage.getByRole("button", { name: "Enable toggle (recursive, whole subtree)" });
  await expect(enableSwitch).toBeVisible();
  await ensureSwitchOn(enableSwitch);
  await expect(masterSwitch).toHaveClass(/ on/);
  await expect(enableSwitch).toHaveClass(/ on/);

  // 2. Admin tenta ligar o toggle de teste — deve ser interceptado, não aplicado.
  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const adminPage = await adminContext.newPage();

  await adminPage.goto(`/applications/${fixtures.appId}`);
  const toggleSwitch = adminPage.getByRole("switch", { name: fixtures.togglePath });
  await expect(toggleSwitch).toHaveAttribute("aria-checked", "false"); // desligado por global-setup
  await toggleSwitch.click();
  await confirmApprovalIntercept(adminPage);

  await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();
  await expect(toggleSwitch).toHaveAttribute("aria-checked", "false"); // não aplicou de verdade

  // 3. Root vê a solicitação pendente e aprova (um clique só, encadeia approve+execute).
  await rootPage.goto("/approvals");
  await rootPage.getByRole("button", { name: "Pending" }).click();

  const pendingRow = rootPage.locator(".appr-row", { hasText: fixtures.togglePath });
  await expect(pendingRow).toContainText("Enable toggle");
  await pendingRow.getByRole("button", { name: "Aprovar" }).click();
  await expect(pendingRow).toHaveCount(0);

  // 4. Admin recarrega (sem invalidação de estado entre telas, confirmado — precisa de
  //    navegação/reload de verdade) e vê o toggle realmente ligado agora.
  await adminPage.reload();
  await expect(adminPage.getByRole("switch", { name: fixtures.togglePath })).toHaveAttribute("aria-checked", "true");

  await rootContext.close();
  await adminContext.close();
});
