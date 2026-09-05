import { expect, test } from "@playwright/test";
import { readFixtures, ROOT_STATE } from "../fixtures";
import { createAndLoginUser, createToggle } from "../helpers";

// v2.6 §6.6: um role `user` (read-only) não pode aplicar uma mudança direto, mas pode propor uma
// via "Suggest a change" — que SEMPRE cria uma solicitação de aprovação, mesmo quando
// toggle_enable/toggle_disable não estão configurados para exigir aprovação (diferente de toda
// outra ação approval-aware desta suíte). Prova isso desligando o workflow de propósito antes de
// sugerir, e fecha o ciclo com root vendo e aprovando a sugestão de outra pessoa.
test("a read-only user suggests a change and root approves it, applying the toggle", async ({ browser }) => {
  const fixtures = readFixtures();
  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const rootPage = await rootContext.newPage();

  // Desliga o workflow de aprovação por completo — a sugestão precisa funcionar mesmo assim.
  const settingsRes = await rootContext.request.put("/api/approval/settings", {
    data: { approval_enabled: false, required_actions: {} },
  });
  expect(settingsRes.ok()).toBeTruthy();

  await createToggle(rootContext.request, fixtures.appId, "e2e.suggest.target");

  const userContext = await createAndLoginUser(browser, rootContext.request, {
    username: "e2e-suggester",
    teamId: fixtures.teamId,
    role: "user",
  });
  const userPage = await userContext.newPage();

  await userPage.goto(`/applications/${fixtures.appId}`);
  const toggleSwitch = userPage.getByRole("switch", { name: "e2e.suggest.target" });
  await expect(toggleSwitch).toBeDisabled();

  const card = userPage.locator(".tg-card", { hasText: "e2e.suggest.target" });
  await card.getByRole("button", { name: /suggest a change/i }).click();

  await expect(userPage.getByText("Suggest a change")).toBeVisible();
  // Toggle recém-criado nasce ligado (createToggle) — a sugestão só faz sentido no sentido
  // oposto do estado atual, então aqui é "disable".
  await expect(userPage.getByText(/suggesting to/i)).toContainText("disable");
  await userPage.getByPlaceholder("Why this change?").fill("needed for the new pricing page");
  await userPage.getByRole("button", { name: /send suggestion/i }).click();

  await expect(userPage.getByText(/sent to the team's approvers/i)).toBeVisible();
  // A sugestão nunca aplica direto — mesmo desligado o workflow, o switch continua ligado.
  await expect(toggleSwitch).toHaveAttribute("aria-checked", "true");

  // Root vê a solicitação (não passa pelo bypass de root — a sugestão sempre cria uma request) e
  // aprova a mudança proposta por outra pessoa. A linha usa o mesmo label fixo de qualquer
  // disable (ApprovalRow#ACTION_LABELS) — o texto "Suggested: disable toggle" + a nota do
  // usuário só aparecem no audit trail (History), checado abaixo.
  await rootPage.goto("/approvals");
  await rootPage.getByRole("button", { name: "Pending" }).click();
  const pendingRow = rootPage.locator(".appr-row", { hasText: "e2e.suggest.target" });
  await expect(pendingRow).toContainText("Disable toggle");
  await pendingRow.getByRole("button", { name: "Aprovar" }).click();
  await expect(pendingRow).toHaveCount(0);

  await userPage.reload();
  await expect(userPage.getByRole("switch", { name: "e2e.suggest.target" })).toHaveAttribute("aria-checked", "false");

  await rootPage.goto("/history");
  await expect(rootPage.getByText(/suggested: disable toggle.*needed for the new pricing page/i).first()).toBeVisible();

  await rootContext.close();
  await userContext.close();
});
