import { expect, test } from "@playwright/test";
import { ADMIN_STATE, readFixtures, ROOT_STATE } from "../fixtures";
import { confirmApprovalIntercept, createToggle, ensureSwitchOn, goToApprovalSettings } from "../helpers";

test("root rejects a pending request: nothing is applied, admin sees it as Rejected", async ({ browser }) => {
  const fixtures = readFixtures();
  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const rootPage = await rootContext.newPage();
  await createToggle(rootContext.request, fixtures.appId, "e2e.reject.target");
  await goToApprovalSettings(rootPage);
  await ensureSwitchOn(rootPage.getByRole("button", { name: "Approval system" }));
  await ensureSwitchOn(rootPage.getByRole("button", { name: "Disable toggle (recursive, whole subtree)" }));

  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`/applications/${fixtures.appId}`);
  const sw = adminPage.getByRole("switch", { name: "e2e.reject.target" });
  await sw.click(); // desabilitar (nasce enabled) — fica pendente
  await confirmApprovalIntercept(adminPage);
  await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();

  await rootPage.goto("/approvals");
  await rootPage.getByRole("button", { name: "Pending" }).click();
  const pendingRow = rootPage.locator(".appr-row", { hasText: "e2e.reject.target" });
  await expect(pendingRow).toContainText("Disable toggle");
  await pendingRow.getByRole("button", { name: "Reject" }).click();

  await rootPage.locator("#reject-reason").fill("Still in use by the mobile app.");
  await rootPage.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(pendingRow).toHaveCount(0); // some da lista de pendentes

  // Estrutura de abas por papel (achado numa auditoria de status geral, corrigido nesta rodada):
  // root nunca tem uma aba "Mine" — em vez disso, itens já resolvidos (de qualquer solicitante)
  // aparecem em "History", org-wide. Confirmado contra get_full_jsx("App")/("ApprovalsView").
  await expect(rootPage.getByRole("button", { name: "Mine" })).not.toBeVisible();
  await rootPage.getByRole("button", { name: "History" }).click();
  const historyRow = rootPage.locator(".appr-row", { hasText: "e2e.reject.target" });
  await expect(historyRow).toContainText("Rejected");

  // Nada foi aplicado: o toggle continua ligado.
  await adminPage.reload();
  await expect(sw).toHaveAttribute("aria-checked", "true");

  // Admin vê a própria solicitação como "Rejected" na aba "Mine" — confirmado via
  // get_full_jsx("ApprovalStatusChip") (o comentário anterior aqui dizia, erradamente, que era
  // PT-BR; nunca tinha sido cruzado contra a fonte real — mesmo tipo de erro corrigido em
  // ApprovalRow.tsx, ver server/CLAUDE.md).
  await adminPage.goto("/approvals");
  await expect(adminPage.getByRole("button", { name: "History" })).not.toBeVisible();
  await adminPage.getByRole("button", { name: "Mine" }).click();
  const mineRow = adminPage.locator(".appr-row", { hasText: "e2e.reject.target" });
  await expect(mineRow).toContainText("Rejected");

  await rootContext.close();
  await adminContext.close();
});
