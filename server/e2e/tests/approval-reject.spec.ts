import { expect, test } from "@playwright/test";
import { ADMIN_STATE, readFixtures, ROOT_STATE } from "../fixtures";
import { createToggle, ensureSwitchOn, goToApprovalSettings } from "../helpers";

test("root rejects a pending request: nothing is applied, admin sees it as Rejected", async ({ browser }) => {
  const fixtures = readFixtures();
  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const rootPage = await rootContext.newPage();
  await createToggle(rootContext.request, fixtures.appId, "e2e.reject.target");
  await goToApprovalSettings(rootPage);
  await ensureSwitchOn(rootPage.getByRole("button", { name: "Sistema de aprovação" }));
  await ensureSwitchOn(rootPage.getByRole("button", { name: "Disable toggle (recursive, whole subtree)" }));

  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`/applications/${fixtures.appId}`);
  const sw = adminPage.getByRole("switch", { name: "e2e.reject.target" });
  await sw.click(); // desabilitar (nasce enabled) — fica pendente
  await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();

  await rootPage.goto("/approvals");
  await rootPage.getByRole("button", { name: "Pending" }).click();
  const pendingRow = rootPage.locator(".appr-row", { hasText: "e2e.reject.target" });
  await expect(pendingRow).toContainText("Disable toggle");
  await pendingRow.getByRole("button", { name: "Reject" }).click();

  await rootPage.locator("#reject-reason").fill("Ainda em uso pelo app mobile.");
  await rootPage.getByRole("button", { name: "Confirmar rejeição" }).click();
  await expect(pendingRow).toHaveCount(0); // some da lista de pendentes

  // Nada foi aplicado: o toggle continua ligado.
  await adminPage.reload();
  await expect(sw).toHaveAttribute("aria-checked", "true");

  // Admin vê a própria solicitação como "Rejected" na aba "Mine".
  await adminPage.goto("/approvals");
  await adminPage.getByRole("button", { name: "Mine" }).click();
  const mineRow = adminPage.locator(".appr-row", { hasText: "e2e.reject.target" });
  await expect(mineRow).toContainText("Rejected");

  await rootContext.close();
  await adminContext.close();
});
