import { expect, test } from "@playwright/test";
import { ADMIN_STATE, readFixtures, ROOT_STATE } from "../fixtures";
import { confirmApprovalIntercept, createToggle, ensureSwitchOn } from "../helpers";

// v2.6 §7: History gains an actor filter, a time-range filter and CSV export (AuditToolbar);
// applications gain their own Activity tab (AuditFeed scoped by application_id). History is
// root-only (matches the prototype's "Root only — changes to toggles live in each application's
// Activity tab" copy verbatim) — an earlier version of this suite kept it open to every role,
// team-scoped, as a deliberate divergence; reverted at the user's explicit request. See
// server/CLAUDE.md for the full history of that decision.
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

// Regressão de um gap real: a Activity tab confirmada tem os mesmos filtros de categoria
// (AuditChips) e intervalo (AuditToolbar, sem ator) da History — só descoberto depois que o
// design-graph passou a conseguir extrair ActivityView de verdade (antes um "buraco" conhecido
// da ferramenta, ver docs/investigation/design-graph-unreachable-components.md). A primeira
// versão desta aba era só uma lista sem filtro nenhum.
test("an application's Activity tab filters by category/range and exports an app-scoped CSV", async ({ browser }) => {
  const fixtures = readFixtures();
  const context = await browser.newContext({ storageState: ADMIN_STATE });
  const page = await context.newPage();

  const togglePath = `e2e.activity.filters.${Date.now()}`;
  await createToggle(context.request, fixtures.appId, togglePath);

  await page.goto(`/applications/${fixtures.appId}`);
  await page.getByRole("button", { name: /^activity$/i }).click();
  await expect(page.locator("b", { hasText: togglePath })).toBeVisible();

  // Nenhum <select> de ator nesta aba — só History tem um.
  await expect(page.getByRole("combobox")).toHaveCount(0);

  await page.getByRole("button", { name: "Keys" }).click();
  await expect(page.locator("b", { hasText: togglePath })).not.toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator("b", { hasText: togglePath })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /export csv/i }).click(),
  ]);
  // "E2E App" — nome fixo da aplicação compartilhada criada em global-setup.ts.
  expect(download.suggestedFilename()).toBe("totoggle-E2E App-activity.csv");

  await context.close();
});

// Regressão de dois bugs reais, mesma causa raiz, reportados em uso ao vivo: com o workflow de
// aprovação ligado, (1) o evento de domínio final de uma ação aprovada nunca carregava
// application_id (só o caminho de execução DIRETA, sem aprovação, tinha sido migrado durante a
// implementação original do v2.6 §7) e, depois de corrigido isso, (2) a Activity ainda só
// mostrava esse passo final — "deveria ter o pedido, a aprovação e a criação, só tem a criação
// listada". Os 3 passos (approval_requested/approval_approved/o evento de domínio) agora carregam
// application_id sempre que a aplicação já existe no momento de cada um (ver
// AuditUseCase.RecordWithApplication e ApprovalUseCase.recordAuditWithApplication).
test("a toggle created through the approval workflow shows the full requested→approved→created journey in its application's Activity tab", async ({ browser }) => {
  const fixtures = readFixtures();

  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const rootPage = await rootContext.newPage();

  await rootPage.goto("/approvals");
  await rootPage.getByRole("button", { name: "Settings" }).click();
  await ensureSwitchOn(rootPage.getByRole("button", { name: "Approval system" }));
  await ensureSwitchOn(rootPage.getByRole("button", { name: "Create toggle" }));

  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const adminPage = await adminContext.newPage();

  const togglePath = `e2e.activity.approved.${Date.now()}`;
  await adminPage.goto(`/applications/${fixtures.appId}`);
  await adminPage.getByRole("button", { name: /new toggle/i }).click();
  await adminPage.getByLabel("Toggle path").fill(togglePath);
  await adminPage.getByRole("button", { name: "Create" }).click();
  await confirmApprovalIntercept(adminPage);
  await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();

  await rootPage.goto("/approvals");
  await rootPage.getByRole("button", { name: "Pending" }).click();
  const pendingRow = rootPage.locator(".appr-row", { hasText: "Create toggle" });
  await pendingRow.getByRole("button", { name: "Approve" }).click();
  await expect(pendingRow).toHaveCount(0);

  await adminPage.goto(`/applications/${fixtures.appId}`);
  await adminPage.getByRole("button", { name: /^activity$/i }).click();

  await expect(adminPage.getByText("Requested: Create toggle")).toBeVisible();
  await expect(adminPage.getByText("Approved Create toggle request")).toBeVisible();
  await expect(adminPage.locator("b", { hasText: togglePath })).toBeVisible();
  // O path do toggle aparece como target tanto do pedido quanto da aprovação (2 linhas), além do
  // texto em negrito do evento de criação já checado acima.
  await expect(adminPage.locator(".audit-target", { hasText: togglePath })).toHaveCount(2);

  await rootContext.close();
  await adminContext.close();
});

// Segundo bug real, mesma causa raiz, achado ao comparar a jornada completa de History com a
// Activity de uma aplicação criada via aprovação ("está faltando toda uma jornada que deveria
// estar sendo apresentado no activity"): request.ApplicationID é nil pra application_create (a
// aplicação não existe no momento do PEDIDO), e ExecuteApprovedAction usava esse nil direto, mesmo
// depois de a aplicação já ter sido criada de verdade e ter um ID conhecido — a aplicação nunca
// via nem seu próprio evento de criação na própria Activity tab.
test("an application created through the approval workflow shows its own creation event in its Activity tab", async ({ browser }) => {
  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const rootPage = await rootContext.newPage();

  await rootPage.goto("/approvals");
  await rootPage.getByRole("button", { name: "Settings" }).click();
  await ensureSwitchOn(rootPage.getByRole("button", { name: "Approval system" }));
  await ensureSwitchOn(rootPage.getByRole("button", { name: "Create or update application" }));

  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const adminPage = await adminContext.newPage();

  const appName = `E2E Approved App ${Date.now()}`;
  await adminPage.goto("/");
  await adminPage.getByRole("button", { name: /new application/i }).click();
  await adminPage.getByLabel("Application name").fill(appName);
  await adminPage.getByRole("button", { name: "Create application" }).click();
  await confirmApprovalIntercept(adminPage);
  await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();

  await rootPage.goto("/approvals");
  await rootPage.getByRole("button", { name: "Pending" }).click();
  const pendingRow = rootPage.locator(".appr-row", { hasText: "Create application" });
  await pendingRow.getByRole("button", { name: "Approve" }).click();
  await expect(pendingRow).toHaveCount(0);

  await adminPage.goto("/");
  await adminPage.getByRole("link").filter({ hasText: appName }).click();
  await adminPage.getByRole("button", { name: /^activity$/i }).click();
  await expect(adminPage.locator("b", { hasText: appName })).toBeVisible();

  await rootContext.close();
  await adminContext.close();
});
