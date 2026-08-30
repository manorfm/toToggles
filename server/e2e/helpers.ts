import type { APIRequestContext, Locator, Page } from "@playwright/test";

// ApprovalSettingsPanel's switches are plain <button className={"switch" + (on ? " on" : "")}>
// (no aria-pressed/aria-checked) — writes immediately on click, no separate Save. Idempotent so
// specs work regardless of file execution order or a setting already flipped by another spec.
// approval_enabled/required_actions are a single shared row on the server — every spec file in
// a full suite run shares it, so "without approval" variants must explicitly force it OFF rather
// than assume a fresh default (another spec may have already turned it on).
export async function ensureSwitchOn(sw: Locator): Promise<void> {
  const className = (await sw.getAttribute("class")) ?? "";
  if (!className.includes(" on")) {
    await sw.click();
  }
}

export async function ensureSwitchOff(sw: Locator): Promise<void> {
  const className = (await sw.getAttribute("class")) ?? "";
  if (className.includes(" on")) {
    await sw.click();
  }
}

export async function goToApprovalSettings(page: Page): Promise<void> {
  await page.goto("/approvals");
  await page.getByRole("button", { name: "Settings" }).click();
}

// Cria um toggle novo e dedicado (não a fixture compartilhada) via API, como root — evita que
// specs que mutam/apagam um toggle (disable, delete) interfiram entre si num full-suite run,
// já que todos os arquivos de teste compartilham um único servidor/banco por invocação.
export async function createToggle(rootRequest: APIRequestContext, appId: string, path: string): Promise<string> {
  const createRes = await rootRequest.post(`/api/applications/${appId}/toggles`, { data: { toggle: path } });
  if (!createRes.ok()) throw new Error(`create toggle "${path}" failed: ${createRes.status()} ${await createRes.text()}`);

  const flatRes = await rootRequest.get(`/api/applications/${appId}/toggles`);
  const flat: Array<{ id: string; path: string }> = await flatRes.json();
  const created = flat.find((t) => t.path === path);
  if (!created) throw new Error(`expected a toggle with path "${path}", got: ${JSON.stringify(flat)}`);
  return created.id;
}
