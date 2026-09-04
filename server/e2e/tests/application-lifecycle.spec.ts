import { expect, test } from "@playwright/test";
import { ADMIN_STATE, readFixtures, ROOT_STATE } from "../fixtures";
import { confirmApprovalIntercept, ensureSwitchOff, ensureSwitchOn, goToApprovalSettings, modalButton } from "../helpers";

test.describe("application lifecycle — create", () => {
  test("without approval: applies immediately", async ({ browser }) => {
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await goToApprovalSettings(rootPage);
    await ensureSwitchOff(rootPage.getByRole("button", { name: "Sistema de aprovação" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/");
    await adminPage.getByRole("button", { name: "New application" }).click();
    await adminPage.locator("#application-name").fill("E2E Created App Direct");
    await adminPage.getByRole("button", { name: "Create application" }).click();

    await expect(adminPage.locator(".card.click", { hasText: "E2E Created App Direct" })).toBeVisible();

    await rootContext.close();
    await adminContext.close();
  });

  test("with approval: pending until root approves, then appears", async ({ browser }) => {
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await goToApprovalSettings(rootPage);
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Sistema de aprovação" }));
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Create or update application" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/");
    await adminPage.getByRole("button", { name: "New application" }).click();
    await adminPage.locator("#application-name").fill("E2E Created App Approved");
    await adminPage.getByRole("button", { name: "Create application" }).click();
    await confirmApprovalIntercept(adminPage);

    await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();
    await expect(adminPage.locator(".card.click", { hasText: "E2E Created App Approved" })).toHaveCount(0);

    await rootPage.goto("/approvals");
    await rootPage.getByRole("button", { name: "Pending" }).click();
    const pendingRow = rootPage.locator(".appr-row", { hasText: "Create application" });
    await expect(pendingRow).toBeVisible();
    await pendingRow.getByRole("button", { name: "Aprovar" }).click();
    await expect(pendingRow).toHaveCount(0);

    await adminPage.reload();
    await expect(adminPage.locator(".card.click", { hasText: "E2E Created App Approved" })).toBeVisible();

    await rootContext.close();
    await adminContext.close();
  });
});

test.describe("application lifecycle — edit name", () => {
  test("without approval: applies immediately", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    const createRes = await rootContext.request.post("/api/applications", {
      data: { name: "E2E Edit Target Direct", team_id: fixtures.teamId },
    });
    expect(createRes.ok()).toBeTruthy();
    await goToApprovalSettings(rootPage);
    await ensureSwitchOff(rootPage.getByRole("button", { name: "Sistema de aprovação" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/");
    await adminPage
      .locator(".card.click", { hasText: "E2E Edit Target Direct" })
      .getByRole("button", { name: "Edit application" })
      .click();
    await adminPage.locator("#application-name").fill("E2E Edit Target Direct Renamed");
    await adminPage.getByRole("button", { name: "Save changes" }).click();

    await expect(adminPage.locator(".card.click", { hasText: "E2E Edit Target Direct Renamed" })).toBeVisible();

    await rootContext.close();
    await adminContext.close();
  });

  test("with approval: pending until root approves, then renamed", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    const createRes = await rootContext.request.post("/api/applications", {
      data: { name: "E2E Edit Target Approved", team_id: fixtures.teamId },
    });
    expect(createRes.ok()).toBeTruthy();
    await goToApprovalSettings(rootPage);
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Sistema de aprovação" }));
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Create or update application" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/");
    await adminPage
      .locator(".card.click", { hasText: "E2E Edit Target Approved" })
      .getByRole("button", { name: "Edit application" })
      .click();
    await adminPage.locator("#application-name").fill("E2E Edit Target Approved Renamed");
    await adminPage.getByRole("button", { name: "Save changes" }).click();
    await confirmApprovalIntercept(adminPage);

    await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();

    await rootPage.goto("/approvals");
    await rootPage.getByRole("button", { name: "Pending" }).click();
    // A ação de update reusa o mesmo action_type "application_create" (não existe
    // application_update — docs/rest-flow.md §9.1), então a linha aparece rotulada "Create
    // application" mesmo sendo uma edição.
    const pendingRow = rootPage.locator(".appr-row", { hasText: "Create application" });
    await expect(pendingRow).toBeVisible();
    await pendingRow.getByRole("button", { name: "Aprovar" }).click();
    await expect(pendingRow).toHaveCount(0);

    await adminPage.reload();
    await expect(adminPage.locator(".card.click", { hasText: "E2E Edit Target Approved Renamed" })).toBeVisible();

    await rootContext.close();
    await adminContext.close();
  });
});

test.describe("application lifecycle — delete", () => {
  test("without approval: root deletes directly via the UI", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    const createRes = await rootContext.request.post("/api/applications", {
      data: { name: "E2E Delete Target Direct", team_id: fixtures.teamId },
    });
    expect(createRes.ok()).toBeTruthy();
    await goToApprovalSettings(rootPage);
    await ensureSwitchOff(rootPage.getByRole("button", { name: "Sistema de aprovação" }));

    // A UI nunca mostra "Delete application" pra quem não é root (canDeleteApp/canDelete =
    // role === "root") — só root consegue chegar nesta jornada clicando.
    await rootPage.goto("/");
    await rootPage
      .locator(".card.click", { hasText: "E2E Delete Target Direct" })
      .getByRole("button", { name: "Edit application" })
      .click();
    await rootPage.getByRole("button", { name: "Delete", exact: true }).click();
    await modalButton(rootPage, "Delete", { dialogTitle: "Delete application" }).click();

    await expect(rootPage.locator(".card.click", { hasText: "E2E Delete Target Direct" })).toHaveCount(0);

    await rootContext.close();
  });

  test("with approval: a non-root caller is intercepted (no UI entry point exists for this role)", async ({ browser }) => {
    // Documented structural fact, same as toggle-delete-with-children.spec.ts: canDeleteApp
    // (ApplicationDetailScreen) and canDelete (ApplicationsScreen) both gate the only "Delete
    // application" entry points to root only — and root always bypasses approval. There is no
    // way for a non-root user to reach this button in the real app, so this is API-level.
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const settingsRes = await rootContext.request.put("/api/approval/settings", {
      data: { approval_enabled: true, required_actions: { application_delete: true } },
    });
    expect(settingsRes.ok()).toBeTruthy();

    const createRes = await rootContext.request.post("/api/applications", {
      data: { name: "E2E Delete Target Approved", team_id: fixtures.teamId },
    });
    expect(createRes.ok()).toBeTruthy();
    const appId: string = (await createRes.json()).id;

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const deleteRes = await adminContext.request.delete(`/api/applications/${appId}`);
    expect(deleteRes.status()).toBe(202);
    const body = await deleteRes.json();
    expect(body.approval_required).toBe(true);
    expect(body.action_type).toBe("application_delete");

    const stillThereRes = await rootContext.request.get(`/api/applications/${appId}`);
    expect(stillThereRes.ok()).toBeTruthy();

    await rootContext.close();
    await adminContext.close();
  });
});
