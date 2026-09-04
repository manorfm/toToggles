import { expect, test } from "@playwright/test";
import { ADMIN_STATE, readFixtures, ROOT_STATE } from "../fixtures";
import { confirmApprovalIntercept, createToggle, ensureSwitchOff, ensureSwitchOn, goToApprovalSettings, modalButton } from "../helpers";

// Cada teste cria seu PRÓPRIO toggle (via API, como root) em vez de reusar a fixture
// compartilhada — vários specs neste suite mexem/apagam toggles no mesmo servidor/banco
// dentro de uma única run completa, então cada cenário precisa do seu próprio alvo pra não
// depender da ordem de execução dos arquivos.
test.describe("toggle lifecycle — create", () => {
  test("without approval: applies immediately", async ({ browser }) => {
    const fixtures = readFixtures();
    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();

    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await goToApprovalSettings(rootPage);
    await ensureSwitchOff(rootPage.getByRole("button", { name: "Sistema de aprovação" }));

    await adminPage.goto(`/applications/${fixtures.appId}`);
    await adminPage.getByRole("button", { name: "New toggle" }).click();
    await adminPage.locator("#toggle-path").fill("e2e.created.direct");
    await adminPage.getByRole("button", { name: "Create", exact: true }).click();

    await expect(adminPage.getByRole("switch", { name: "e2e.created.direct" })).toBeVisible();

    await rootContext.close();
    await adminContext.close();
  });

  test("with approval: pending until root approves, then appears", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await goToApprovalSettings(rootPage);
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Sistema de aprovação" }));
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Create toggle" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/applications/${fixtures.appId}`);
    await adminPage.getByRole("button", { name: "New toggle" }).click();
    await adminPage.locator("#toggle-path").fill("e2e.created.approved");
    await adminPage.getByRole("button", { name: "Create", exact: true }).click();
    await confirmApprovalIntercept(adminPage);

    await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();
    await expect(adminPage.getByRole("switch", { name: "e2e.created.approved" })).toHaveCount(0);

    await rootPage.goto("/approvals");
    await rootPage.getByRole("button", { name: "Pending" }).click();
    const pendingRow = rootPage.locator(".appr-row", { hasText: "Create toggle" });
    await expect(pendingRow).toBeVisible();
    await pendingRow.getByRole("button", { name: "Aprovar" }).click();
    await expect(pendingRow).toHaveCount(0);

    await adminPage.reload();
    await expect(adminPage.getByRole("switch", { name: "e2e.created.approved" })).toBeVisible();

    await rootContext.close();
    await adminContext.close();
  });
});

test.describe("toggle lifecycle — disable (recursive)", () => {
  test("without approval: applies immediately", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await createToggle(rootContext.request, fixtures.appId, "e2e.disable.direct");
    await goToApprovalSettings(rootPage);
    await ensureSwitchOff(rootPage.getByRole("button", { name: "Sistema de aprovação" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/applications/${fixtures.appId}`);
    const sw = adminPage.getByRole("switch", { name: "e2e.disable.direct" });
    await expect(sw).toHaveAttribute("aria-checked", "true"); // toggles nascem enabled
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");

    await rootContext.close();
    await adminContext.close();
  });

  test("with approval: pending until root approves, then disabled", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await createToggle(rootContext.request, fixtures.appId, "e2e.disable.approved");
    await goToApprovalSettings(rootPage);
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Sistema de aprovação" }));
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Disable toggle (recursive, whole subtree)" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/applications/${fixtures.appId}`);
    const sw = adminPage.getByRole("switch", { name: "e2e.disable.approved" });
    await sw.click();
    await confirmApprovalIntercept(adminPage);

    await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();
    await expect(sw).toHaveAttribute("aria-checked", "true"); // não aplicou

    await rootPage.goto("/approvals");
    await rootPage.getByRole("button", { name: "Pending" }).click();
    const pendingRow = rootPage.locator(".appr-row", { hasText: "e2e.disable.approved" });
    await expect(pendingRow).toContainText("Disable toggle");
    await pendingRow.getByRole("button", { name: "Aprovar" }).click();
    await expect(pendingRow).toHaveCount(0);

    await adminPage.reload();
    await expect(adminPage.getByRole("switch", { name: "e2e.disable.approved" })).toHaveAttribute("aria-checked", "false");

    await rootContext.close();
    await adminContext.close();
  });
});

test.describe("toggle lifecycle — configure activation rule", () => {
  test("without approval: applies immediately", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await createToggle(rootContext.request, fixtures.appId, "e2e.rule.direct");
    await goToApprovalSettings(rootPage);
    await ensureSwitchOff(rootPage.getByRole("button", { name: "Sistema de aprovação" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/applications/${fixtures.appId}`);
    await adminPage.getByRole("switch", { name: "e2e.rule.direct" }).waitFor();
    await adminPage.locator(".tg-card", { hasText: "e2e.rule.direct" }).getByRole("button", { name: "Configure" }).click();

    await adminPage.getByRole("button", { name: "Activation rule" }).click();
    await adminPage.getByText("Percentage", { exact: true }).click();
    await adminPage.locator("#rule-value").fill("25");
    await adminPage.getByRole("button", { name: "Save changes" }).click();

    await expect(adminPage.locator(".tg-card", { hasText: "e2e.rule.direct" }).locator(".rule-tag")).toBeVisible();

    await rootContext.close();
    await adminContext.close();
  });

  test("with approval: pending until root approves, then rule is saved", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await createToggle(rootContext.request, fixtures.appId, "e2e.rule.approved");
    await goToApprovalSettings(rootPage);
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Sistema de aprovação" }));
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Change activation rule" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/applications/${fixtures.appId}`);
    await adminPage.getByRole("switch", { name: "e2e.rule.approved" }).waitFor();
    await adminPage.locator(".tg-card", { hasText: "e2e.rule.approved" }).getByRole("button", { name: "Configure" }).click();
    await adminPage.getByRole("button", { name: "Activation rule" }).click();
    await adminPage.getByText("Percentage", { exact: true }).click();
    await adminPage.locator("#rule-value").fill("25");
    await adminPage.getByRole("button", { name: "Save changes" }).click();
    await confirmApprovalIntercept(adminPage);

    await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();

    await rootPage.goto("/approvals");
    await rootPage.getByRole("button", { name: "Pending" }).click();
    const pendingRow = rootPage.locator(".appr-row", { hasText: "e2e.rule.approved" });
    await expect(pendingRow).toContainText("Change activation rule");
    await pendingRow.getByRole("button", { name: "Aprovar" }).click();
    await expect(pendingRow).toHaveCount(0);

    await adminPage.reload();
    await expect(adminPage.locator(".tg-card", { hasText: "e2e.rule.approved" }).locator(".rule-tag")).toBeVisible();

    await rootContext.close();
    await adminContext.close();
  });
});

test.describe("toggle lifecycle — delete a leaf", () => {
  test("without approval: applies immediately", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await createToggle(rootContext.request, fixtures.appId, "e2e.delete.direct");
    await goToApprovalSettings(rootPage);
    await ensureSwitchOff(rootPage.getByRole("button", { name: "Sistema de aprovação" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/applications/${fixtures.appId}`);
    await adminPage.getByRole("switch", { name: "e2e.delete.direct" }).waitFor();
    await adminPage.locator(".tg-card", { hasText: "e2e.delete.direct" }).getByRole("button", { name: "Delete", exact: true }).click();
    await modalButton(adminPage, "Delete toggle", { dialogTitle: "Delete toggle" }).click();

    await expect(adminPage.getByRole("switch", { name: "e2e.delete.direct" })).toHaveCount(0);

    await rootContext.close();
    await adminContext.close();
  });

  // v2.6 §4.2: the success toast carries an "Undo" action that calls the real restore endpoint
  // (not a client-side patch — this app persists to a real backend, unlike the prototype).
  test("Undo on the delete toast restores the toggle via a real API call", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await createToggle(rootContext.request, fixtures.appId, "e2e.delete.undo");
    await goToApprovalSettings(rootPage);
    await ensureSwitchOff(rootPage.getByRole("button", { name: "Sistema de aprovação" }));

    await rootPage.goto(`/applications/${fixtures.appId}`);
    await rootPage.getByRole("switch", { name: "e2e.delete.undo" }).waitFor();
    await rootPage.locator(".tg-card", { hasText: "e2e.delete.undo" }).getByRole("button", { name: "Delete", exact: true }).click();
    await modalButton(rootPage, "Delete toggle", { dialogTitle: "Delete toggle" }).click();
    await expect(rootPage.getByRole("switch", { name: "e2e.delete.undo" })).toHaveCount(0);

    await rootPage.getByRole("button", { name: "Undo" }).click();

    await expect(rootPage.getByRole("switch", { name: "e2e.delete.undo" })).toBeVisible();

    await rootContext.close();
  });

  test("with approval: pending until root approves, then removed", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await createToggle(rootContext.request, fixtures.appId, "e2e.delete.approved");
    await goToApprovalSettings(rootPage);
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Sistema de aprovação" }));
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Delete toggle" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/applications/${fixtures.appId}`);
    await adminPage.getByRole("switch", { name: "e2e.delete.approved" }).waitFor();
    await adminPage.locator(".tg-card", { hasText: "e2e.delete.approved" }).getByRole("button", { name: "Delete", exact: true }).click();
    await modalButton(adminPage, "Delete toggle", { dialogTitle: "Delete toggle" }).click();
    await confirmApprovalIntercept(adminPage);

    await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();
    await expect(adminPage.getByRole("switch", { name: "e2e.delete.approved" })).toBeVisible(); // ainda não apagou

    await rootPage.goto("/approvals");
    await rootPage.getByRole("button", { name: "Pending" }).click();
    const pendingRow = rootPage.locator(".appr-row", { hasText: "e2e.delete.approved" });
    await expect(pendingRow).toContainText("Delete toggle");
    await pendingRow.getByRole("button", { name: "Aprovar" }).click();
    await expect(pendingRow).toHaveCount(0);

    await adminPage.reload();
    await expect(adminPage.getByRole("switch", { name: "e2e.delete.approved" })).toHaveCount(0);

    await rootContext.close();
    await adminContext.close();
  });
});
