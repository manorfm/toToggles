import { expect, test } from "@playwright/test";
import { ADMIN_STATE, readFixtures, ROOT_STATE } from "../fixtures";
import { createToggle, ensureSwitchOff, goToApprovalSettings } from "../helpers";

// v2.6 §6.5: multi-select in the toggle grid — flips the OWN bit of every checked leaf in one
// call (never recursive), via the real "Select" chip / bulk bar UI, against the real backend.
// Toggles are born enabled, so "Disable selected" is the one directly observable without any
// setup mutation first.
test.describe("toggle bulk select", () => {
  test("without approval: selecting two leaves and clicking Disable selected flips both", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await createToggle(rootContext.request, fixtures.appId, "e2e.bulk.one");
    await createToggle(rootContext.request, fixtures.appId, "e2e.bulk.two");
    await goToApprovalSettings(rootPage);
    await ensureSwitchOff(rootPage.getByRole("button", { name: "Sistema de aprovação" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/applications/${fixtures.appId}`);
    const oneSwitch = adminPage.getByRole("switch", { name: "e2e.bulk.one" });
    const twoSwitch = adminPage.getByRole("switch", { name: "e2e.bulk.two" });
    await oneSwitch.waitFor();
    await expect(oneSwitch).toHaveAttribute("aria-checked", "true");
    await expect(twoSwitch).toHaveAttribute("aria-checked", "true");

    await adminPage.getByRole("button", { name: "Select", exact: true }).click();
    const oneCard = adminPage.locator(".tg-card", { hasText: "e2e.bulk.one" });
    const twoCard = adminPage.locator(".tg-card", { hasText: "e2e.bulk.two" });
    await oneCard.locator(".tg-check").check();
    await twoCard.locator(".tg-check").check();

    await expect(adminPage.getByText("2 selected")).toBeVisible();
    await adminPage.getByRole("button", { name: "Disable selected" }).click();

    await expect(oneSwitch).toHaveAttribute("aria-checked", "false");
    await expect(twoSwitch).toHaveAttribute("aria-checked", "false");
    // Saiu do modo de seleção sozinho depois da ação.
    await expect(adminPage.getByRole("button", { name: "Select", exact: true })).toBeVisible();

    await rootContext.close();
    await adminContext.close();
  });

  test("Cancel selection exits select mode without changing anything", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await createToggle(rootContext.request, fixtures.appId, "e2e.bulk.cancel");
    await goToApprovalSettings(rootPage);
    await ensureSwitchOff(rootPage.getByRole("button", { name: "Sistema de aprovação" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/applications/${fixtures.appId}`);
    const sw = adminPage.getByRole("switch", { name: "e2e.bulk.cancel" });
    await sw.waitFor();

    await adminPage.getByRole("button", { name: "Select", exact: true }).click();
    await adminPage.locator(".tg-card", { hasText: "e2e.bulk.cancel" }).locator(".tg-check").check();
    await adminPage.getByRole("button", { name: "Cancel selection" }).click();

    await expect(adminPage.getByRole("button", { name: "Select", exact: true })).toBeVisible();
    await expect(sw).toHaveAttribute("aria-checked", "true");

    await rootContext.close();
    await adminContext.close();
  });
});
