import { expect, test } from "@playwright/test";
import { ADMIN_STATE, readFixtures, ROOT_STATE } from "../fixtures";
import { createToggle } from "../helpers";

// v2.6 §7: History gains an actor filter, a time-range filter and CSV export (AuditToolbar);
// applications gain their own Activity tab (AuditFeed scoped by application_id). History itself
// stays visible to any authenticated role (team-scoped, per domain/policy.AuditAccess) — a
// deliberate divergence from the prototype's "Root only" copy, since restricting it would remove
// an already-shipped, already-tested feature; see server/CLAUDE.md.
test("History's actor filter narrows the feed to the selected actor's own events", async ({ browser }) => {
  const fixtures = readFixtures();
  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const rootPage = await rootContext.newPage();
  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });

  const rootTogglePath = `e2e.history.root.${Date.now()}`;
  const adminTogglePath = `e2e.history.admin.${Date.now()}`;
  await createToggle(rootContext.request, fixtures.appId, rootTogglePath);
  await createToggle(adminContext.request, fixtures.appId, adminTogglePath);

  await rootPage.goto("/history");
  await expect(rootPage.getByText(rootTogglePath)).toBeVisible();
  await expect(rootPage.getByText(adminTogglePath)).toBeVisible();

  await rootPage.getByRole("combobox").selectOption({ label: "Root" });

  await expect(rootPage.getByText(rootTogglePath)).toBeVisible();
  await expect(rootPage.getByText(adminTogglePath)).not.toBeVisible();

  await rootContext.close();
  await adminContext.close();
});

test("Export CSV downloads a file with the header and the visible entries", async ({ browser }) => {
  const fixtures = readFixtures();
  const context = await browser.newContext({ storageState: ROOT_STATE });
  const page = await context.newPage();

  const togglePath = `e2e.history.csv.${Date.now()}`;
  await createToggle(context.request, fixtures.appId, togglePath);

  await page.goto("/history");
  await expect(page.getByText(togglePath)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /export csv/i }).click(),
  ]);

  expect(download.suggestedFilename()).toBe("totoggle-history.csv");
  const path = await download.path();
  const fs = await import("node:fs/promises");
  const content = await fs.readFile(path!, "utf-8");
  expect(content.split("\r\n")[0]).toBe('"When","Actor","Type","Text","Target"');
  expect(content).toContain(togglePath);

  await context.close();
});

// A Activity tab é alcançável por qualquer role autenticado (nenhuma checagem de time por trás
// dela, mesma postura de acesso de GET /applications/:id) — testado como admin, não root, de
// propósito.
test("an application's Activity tab shows only that application's own audit trail", async ({ browser }) => {
  const fixtures = readFixtures();
  const context = await browser.newContext({ storageState: ADMIN_STATE });
  const page = await context.newPage();

  const togglePath = `e2e.activity.${Date.now()}`;
  await createToggle(context.request, fixtures.appId, togglePath);

  await page.goto(`/applications/${fixtures.appId}`);
  await page.getByRole("button", { name: /^activity$/i }).click();

  // Escopado ao elemento `<b>` do texto de auditoria — o mesmo path também existe (escondido, a
  // aba Toggles fica montada por trás) no card da grade de toggles.
  await expect(page.locator("b", { hasText: togglePath })).toBeVisible();

  await context.close();
});
