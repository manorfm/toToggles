import { expect, test } from "@playwright/test";
import { ROOT_STATE } from "../fixtures";

// v2.6 §6.7-6.9: onboarding wizard — root only (creating a team, the wizard's first real step,
// is RequireRoot() on the backend). Walks the full 7-step flow against the REAL server (no
// mocking), then confirms every created resource actually exists, not just that the wizard's own
// summary screen claims so.
test("root completes the onboarding wizard and every step's resource is created for real", async ({ browser }) => {
  const context = await browser.newContext({ storageState: ROOT_STATE });
  const page = await context.newPage();

  await page.goto("/");
  await page.getByRole("button", { name: /getting started/i }).click();

  await expect(page.getByText("Set up toToggle in 6 steps")).toBeVisible();
  await page.getByRole("button", { name: /start setup/i }).click();

  // Team
  await expect(page.getByText("Create your first team")).toBeVisible();
  await page.getByLabel("Team name").fill("E2E OB Team");
  await page.getByRole("button", { name: /^next/i }).click();

  // People
  await expect(page.getByText(/add someone to/i)).toBeVisible();
  await page.getByLabel("Full name").fill("E2E OB Member");
  await page.getByRole("button", { name: /^next/i }).click();

  // Application
  await expect(page.getByText("Create your first Application")).toBeVisible();
  await page.getByLabel("Application name").fill("E2E OB App");
  await page.getByRole("button", { name: /^next/i }).click();

  // Toggle
  await expect(page.getByText(/create the first toggle/i)).toBeVisible();
  await page.getByLabel("Toggle path").fill("onboarding.demo");
  await page.getByRole("button", { name: /^next/i }).click();

  // Service key — generate it this time (proves the real generate-secret call, not just skip)
  await expect(page.getByText(/generate the key for/i)).toBeVisible();
  await page.getByRole("button", { name: /generate service key/i }).click();
  await expect(page.locator(".okr-val")).toBeVisible();
  const nextButton = page.getByRole("button", { name: /^next/i });
  await expect(nextButton).toBeDisabled();
  await page.getByRole("checkbox", { name: /i stored the key/i }).check();
  await expect(nextButton).toBeEnabled();
  await nextButton.click();

  // Integration summary
  await expect(page.getByText("All set!")).toBeVisible();
  await expect(page.getByText("E2E OB Team", { selector: "b" })).toBeVisible();
  await expect(page.getByText(/e2e ob member — login/i)).toBeVisible();
  await expect(page.getByText("E2E OB App", { selector: "b" })).toBeVisible();
  await expect(page.getByText("onboarding.demo", { selector: "code" })).toBeVisible();

  await page.getByRole("button", { name: /open totoggle/i }).click();

  // Wizard closed and nav label flipped to "Review setup" (idempotency flag persisted).
  await expect(page.getByText("Set up toToggle in 6 steps")).not.toBeVisible();
  await expect(page.getByRole("button", { name: /review setup/i })).toBeVisible();

  // Every resource is real, not just claimed by the summary screen: team, app, toggle, member.
  const teamsRes = await page.request.get("/api/teams");
  const teams: Array<{ name: string }> = (await teamsRes.json()).teams;
  expect(teams.some((t) => t.name === "E2E OB Team")).toBe(true);

  const appsRes = await page.request.get("/api/applications");
  const apps: Array<{ id: string; name: string }> = await appsRes.json();
  const app = apps.find((a) => a.name === "E2E OB App");
  expect(app).toBeTruthy();

  const togglesRes = await page.request.get(`/api/applications/${app!.id}/toggles`);
  const toggles: Array<{ path: string }> = await togglesRes.json();
  expect(toggles.some((t) => t.path === "onboarding.demo")).toBe(true);

  const usersRes = await page.request.get("/api/users");
  const users: Array<{ name: string }> = (await usersRes.json()).users;
  expect(users.some((u) => u.name === "E2E OB Member")).toBe(true);

  await context.close();
});

// v2.6 §6.7: reabrir o wizard com o MESMO nome de team/app já existente (criado pelo teste
// anterior, persistido no servidor — o rótulo "Getting started"/"Review setup" do nav item é só
// cosmético via localStorage e não afeta esta checagem) reusa os registros em vez de tentar criar
// duplicados — a idempotência confirmada no protótipo real (obCreateTeam/obCreateApp fazem
// dedupe-by-name).
test("reopening the wizard with an existing team/application name reuses them instead of erroring", async ({ browser }) => {
  const context = await browser.newContext({ storageState: ROOT_STATE });
  const page = await context.newPage();

  await page.goto("/");
  await page.getByRole("button", { name: /getting started|review setup/i }).click();
  await page.getByRole("button", { name: /start setup/i }).click();

  await page.getByLabel("Team name").fill("E2E OB Team");
  await page.getByRole("button", { name: /^next/i }).click();
  await expect(page.getByText(/add someone to/i)).toBeVisible();

  await page.getByLabel("Full name").fill("E2E OB Member Two");
  await page.getByRole("button", { name: /^next/i }).click();
  await expect(page.getByText("Create your first Application")).toBeVisible();

  await page.getByLabel("Application name").fill("E2E OB App");
  await page.getByRole("button", { name: /^next/i }).click();
  await expect(page.getByText(/create the first toggle/i)).toBeVisible();

  // Reused the existing team, so no second "E2E OB Team" was created.
  const teamsRes = await page.request.get("/api/teams");
  const teams: Array<{ name: string }> = (await teamsRes.json()).teams;
  expect(teams.filter((t) => t.name === "E2E OB Team")).toHaveLength(1);

  await context.close();
});
