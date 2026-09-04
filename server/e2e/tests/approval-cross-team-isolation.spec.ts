import { expect, test } from "@playwright/test";
import { ROOT_STATE } from "../fixtures";
import { confirmApprovalIntercept, createAndLoginUser, createToggle, ensureSwitchOn, goToApprovalSettings } from "../helpers";

// Proves the team-scoped authorization fix end to end: two independent teams, one admin per
// team (neither an approver), each with their own pending approval request. Every other approval
// spec in this suite uses the single shared "E2E Team" fixture — this one deliberately creates
// two fresh teams because the whole point is cross-team isolation, which the shared fixture can't
// exercise (there's only one team to be isolated from).
test("a team's approval requests are invisible and unreachable to another team's member", async ({ browser }) => {
  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const rootPage = await rootContext.newPage();

  const teamARes = await rootContext.request.post("/api/teams", { data: { name: "E2E Isolation Team A" } });
  expect(teamARes.ok()).toBeTruthy();
  const teamAId: string = (await teamARes.json()).team.id;
  const teamBRes = await rootContext.request.post("/api/teams", { data: { name: "E2E Isolation Team B" } });
  expect(teamBRes.ok()).toBeTruthy();
  const teamBId: string = (await teamBRes.json()).team.id;

  const appARes = await rootContext.request.post("/api/applications", { data: { name: "E2E Isolation App A", team_id: teamAId } });
  expect(appARes.ok()).toBeTruthy();
  const appAId: string = (await appARes.json()).id;
  const appBRes = await rootContext.request.post("/api/applications", { data: { name: "E2E Isolation App B", team_id: teamBId } });
  expect(appBRes.ok()).toBeTruthy();
  const appBId: string = (await appBRes.json()).id;

  const toggleAPath = "e2e.isolation.teama";
  const toggleBPath = "e2e.isolation.teamb";
  await createToggle(rootContext.request, appAId, toggleAPath);
  await createToggle(rootContext.request, appBId, toggleBPath);

  await goToApprovalSettings(rootPage);
  await ensureSwitchOn(rootPage.getByRole("button", { name: "Sistema de aprovação" }));
  await ensureSwitchOn(rootPage.getByRole("button", { name: "Disable toggle (recursive, whole subtree)" }));

  // Admin A is a plain member of team A (not an approver) — their request sits pending for
  // someone else to act on. Admin B is team B's designated approver, so at the end of this test
  // they can execute their own (already-approved-by-root) request — proving CanAct's "approver
  // of the SAME team" branch, not just the root bypass.
  const adminAContext = await createAndLoginUser(browser, rootContext.request, { username: "e2e-iso-admin-a", teamId: teamAId });
  const adminBContext = await createAndLoginUser(browser, rootContext.request, {
    username: "e2e-iso-admin-b",
    teamId: teamBId,
    isApprover: true,
  });

  const adminAPage = await adminAContext.newPage();
  await adminAPage.goto(`/applications/${appAId}`);
  await adminAPage.getByRole("switch", { name: toggleAPath }).click();
  await confirmApprovalIntercept(adminAPage);
  await expect(adminAPage.getByText(/aguardando aprovação/i)).toBeVisible();

  const adminBPage = await adminBContext.newPage();
  await adminBPage.goto(`/applications/${appBId}`);
  await adminBPage.getByRole("switch", { name: toggleBPath }).click();
  await confirmApprovalIntercept(adminBPage);
  await expect(adminBPage.getByText(/aguardando aprovação/i)).toBeVisible();

  // History (GET /api/audit — the real audit trail, not GET /api/approval/requests: History was
  // rebuilt onto a genuine audit log in a prior session, see server/CLAUDE.md's "History"
  // section) must show admin A only their own team's request. domain/policy.AuditAccess enforces
  // the same team-membership scoping as the approval workflow itself. Two entries legitimately
  // mention the toggle path (the toggle's own creation + the "Requested: Disable toggle" entry
  // from the pending approval above) — .first() is enough to prove team A's own event is there.
  await adminAPage.goto("/history");
  await expect(adminAPage.locator(".audit-item", { hasText: toggleAPath }).first()).toBeVisible();
  await expect(adminAPage.locator(".audit-item", { hasText: toggleBPath })).toHaveCount(0);

  // Find team B's pending request id as root — admin A has no way to see it through the UI/API,
  // but the point of this test is authorization, not obscurity: even knowing the id, admin A
  // must be refused.
  const allRequestsRes = await rootContext.request.get("/api/approval/requests");
  expect(allRequestsRes.ok()).toBeTruthy();
  const allRequests: Array<{ id: string; toggle_path?: string; team_id: string }> = (await allRequestsRes.json()).data;
  const teamBRequest = allRequests.find((r) => r.toggle_path === toggleBPath);
  if (!teamBRequest) throw new Error(`expected a pending request for toggle "${toggleBPath}"`);

  // Admin A cannot list team B's requests.
  const teamBRequestsAsA = await adminAContext.request.get(`/api/approval/teams/${teamBId}/requests`);
  expect(teamBRequestsAsA.status()).toBe(403);

  // Admin A cannot approve team B's request.
  const approveAsA = await adminAContext.request.post(`/api/approval/requests/${teamBRequest.id}/approve`);
  expect(approveAsA.status()).toBe(403);

  // Root approves team B's request (but does not execute it) so we can prove the execute gate
  // fires independently of the approve gate — this is the most severe gap the fix closes:
  // ExecuteApprovedAction previously had no caller check whatsoever.
  const approveAsRoot = await rootContext.request.post(`/api/approval/requests/${teamBRequest.id}/approve`);
  expect(approveAsRoot.ok()).toBeTruthy();

  const executeAsA = await adminAContext.request.post(`/api/approval/requests/${teamBRequest.id}/execute`);
  expect(executeAsA.status()).toBe(403);

  // Sanity: team B's own approver can still execute team B's now-approved request.
  const executeAsB = await adminBContext.request.post(`/api/approval/requests/${teamBRequest.id}/execute`);
  expect(executeAsB.ok()).toBeTruthy();

  await rootContext.close();
  await adminAContext.close();
  await adminBContext.close();
});
