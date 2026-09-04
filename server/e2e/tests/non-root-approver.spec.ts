import { expect, test } from "@playwright/test";
import { ADMIN_STATE, readFixtures, ROOT_STATE } from "../fixtures";
import { confirmApprovalIntercept, createToggle, ensureSwitchOn, goToApprovalSettings } from "../helpers";

// Todos os outros specs de aprovação usam ROOT como aprovador — root sempre ignora o workflow
// (bypass), então nunca exercitou de verdade CanBeApprovedBy (autoaprovação proibida, e só
// root/aprovador designado do time pode aprovar — docs/rest-flow.md §9.2/§9.3). Este teste cria
// um segundo usuário, real aprovador do time, e faz ELE aprovar a solicitação de outra pessoa.
test("a designated team approver (not root) can see and approve someone else's request", async ({ browser }) => {
  const fixtures = readFixtures();
  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const rootPage = await rootContext.newPage();
  await createToggle(rootContext.request, fixtures.appId, "e2e.nonrootapprove.target");
  await goToApprovalSettings(rootPage);
  await ensureSwitchOn(rootPage.getByRole("button", { name: "Sistema de aprovação" }));
  await ensureSwitchOn(rootPage.getByRole("button", { name: "Disable toggle (recursive, whole subtree)" }));

  // Cria o aprovador direto por API — role admin (só admin/root podem ser aprovadores,
  // docs/rest-flow.md §9.3) no mesmo time da aplicação, já com is_approver: true.
  const createApproverRes = await rootContext.request.post("/api/users", {
    data: { name: "E2E Approver", username: "e2e-approver", role: "admin", team_id: fixtures.teamId, is_approver: true },
  });
  expect(createApproverRes.ok()).toBeTruthy();
  const approverGeneratedPassword: string = (await createApproverRes.json()).password;

  const approverContext = await browser.newContext();
  const approverFirstLogin = await approverContext.request.post("/api/auth/login", {
    data: { username: "e2e-approver", password: approverGeneratedPassword },
  });
  expect(approverFirstLogin.ok()).toBeTruthy();
  const changeRes = await approverContext.request.post("/api/auth/change-password-first-time", {
    data: { current_password: approverGeneratedPassword, new_password: "e2eApproverPass1" },
  });
  expect(changeRes.ok()).toBeTruthy();
  const approverLogin = await approverContext.request.post("/api/auth/login", {
    data: { username: "e2e-approver", password: "e2eApproverPass1" },
  });
  expect(approverLogin.ok()).toBeTruthy();

  // e2e-admin (não é aprovador) tenta desligar o toggle — fica pendente.
  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`/applications/${fixtures.appId}`);
  await adminPage.getByRole("switch", { name: "e2e.nonrootapprove.target" }).click();
  await confirmApprovalIntercept(adminPage);
  await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();

  // O aprovador (não-root) vê a aba "Approvable" (não "Pending", esse rótulo é só pra root) e
  // aprova a solicitação de outra pessoa.
  const approverPage = await approverContext.newPage();
  await approverPage.goto("/approvals");
  await approverPage.getByRole("button", { name: "Approvable" }).click();
  const pendingRow = approverPage.locator(".appr-row", { hasText: "e2e.nonrootapprove.target" });
  await expect(pendingRow).toContainText("Disable toggle");
  await pendingRow.getByRole("button", { name: "Aprovar" }).click();
  await expect(pendingRow).toHaveCount(0);

  await adminPage.reload();
  await expect(adminPage.getByRole("switch", { name: "e2e.nonrootapprove.target" })).toHaveAttribute("aria-checked", "false");

  await rootContext.close();
  await approverContext.close();
  await adminContext.close();
});
