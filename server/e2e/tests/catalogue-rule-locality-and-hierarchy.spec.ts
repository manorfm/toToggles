import { expect, test } from "@playwright/test";
import { readFixtures, ROOT_STATE } from "../fixtures";
import { createToggle } from "../helpers";

interface CatalogueToggle {
  id: string;
  path: string;
  enabled: boolean;
  has_activation_rule: boolean;
  activation_rule: { type: string; value: string; config?: { context_key?: string } } | null;
}

interface HierarchyNode {
  value: string;
  enabled: boolean;
  toggles?: HierarchyNode[];
}

function requireToggle(toggles: CatalogueToggle[], path: string): CatalogueToggle {
  const toggle = toggles.find((candidate) => candidate.path === path);
  expect(toggle, `expected catalogue to contain ${path}`).toBeTruthy();
  return toggle!;
}

function requireChild(node: HierarchyNode, value: string): HierarchyNode {
  const child = node.toggles?.find((candidate) => candidate.value === value);
  expect(child, `expected ${node.value} to contain ${value}`).toBeTruthy();
  return child!;
}

// Rules belong to the exact toggle being evaluated. The public catalogue must therefore retain
// the rule on its owner instead of copying it to descendants, which would make SDK evaluation
// ambiguous and incorrectly turn a parent rule into a hierarchy rule.
test("the external catalogue keeps an activation rule local to its configured toggle", async ({ browser, request }) => {
  const fixtures = readFixtures();
  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const parentPath = "wave7localrule.parent";
  const childPath = `${parentPath}.child`;

  await createToggle(rootContext.request, fixtures.appId, childPath);

  const flatRes = await rootContext.request.get(`/api/applications/${fixtures.appId}/toggles`);
  expect(flatRes.ok()).toBeTruthy();
  const flatToggles = (await flatRes.json()) as CatalogueToggle[];
  const parent = requireToggle(flatToggles, parentPath);

  const setRuleRes = await rootContext.request.put(`/api/applications/${fixtures.appId}/toggles/${parent.id}`, {
    data: {
      enabled: true,
      has_activation_rule: true,
      activation_rule: { type: "user_id", value: "eligible-user", config: { context_key: "user_id" } },
    },
  });
  expect(setRuleRes.ok()).toBeTruthy();

  const keyRes = await rootContext.request.post(`/api/applications/${fixtures.appId}/generate-secret`);
  expect(keyRes.ok()).toBeTruthy();
  const { plain_key: secret } = (await keyRes.json()) as { plain_key: string };

  const catalogueRes = await request.get("/api/toggles", { headers: { "X-API-Key": secret } });
  expect(catalogueRes.ok()).toBeTruthy();
  const catalogue = (await catalogueRes.json()) as { application: { toggles: CatalogueToggle[] } };
  const catalogueParent = requireToggle(catalogue.application.toggles, parentPath);
  const catalogueChild = requireToggle(catalogue.application.toggles, childPath);

  expect(catalogueParent.has_activation_rule).toBe(true);
  expect(catalogueParent.activation_rule).toMatchObject({ type: "user_id", value: "eligible-user" });
  expect(catalogueChild.has_activation_rule).toBe(false);
  expect(catalogueChild.activation_rule).toBeNull();

  await rootContext.close();
});

// The non-recursive rule endpoint changes only the target's own enabled bit. The hierarchy view
// must nevertheless mark descendants inactive, while the external catalogue preserves each own
// bit so SDKs can apply the same ancestor-blocking rule locally.
test("a disabled ancestor blocks a descendant without overwriting the descendant own state", async ({ browser, request }) => {
  const fixtures = readFixtures();
  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const parentPath = "wave7hierarchy.parent";
  const childPath = `${parentPath}.child`;

  await createToggle(rootContext.request, fixtures.appId, childPath);

  const flatRes = await rootContext.request.get(`/api/applications/${fixtures.appId}/toggles`);
  expect(flatRes.ok()).toBeTruthy();
  const flatToggles = (await flatRes.json()) as CatalogueToggle[];
  const parent = requireToggle(flatToggles, parentPath);

  const disableRes = await rootContext.request.put(`/api/applications/${fixtures.appId}/toggles/${parent.id}`, {
    data: { enabled: false, has_activation_rule: false },
  });
  expect(disableRes.ok()).toBeTruthy();

  const hierarchyRes = await rootContext.request.get(`/api/applications/${fixtures.appId}/toggles?hierarchy=true`);
  expect(hierarchyRes.ok()).toBeTruthy();
  const hierarchy = (await hierarchyRes.json()) as { toggles: HierarchyNode[] };
  const root = hierarchy.toggles.find((node) => node.value === "wave7hierarchy");
  expect(root).toBeTruthy();
  const hierarchyParent = requireChild(root!, "parent");
  const hierarchyChild = requireChild(hierarchyParent, "child");
  expect(hierarchyParent.enabled).toBe(false);
  expect(hierarchyChild.enabled).toBe(false);

  const keyRes = await rootContext.request.post(`/api/applications/${fixtures.appId}/generate-secret`);
  expect(keyRes.ok()).toBeTruthy();
  const { plain_key: secret } = (await keyRes.json()) as { plain_key: string };
  const catalogueRes = await request.get("/api/toggles", { headers: { "X-API-Key": secret } });
  expect(catalogueRes.ok()).toBeTruthy();
  const catalogue = (await catalogueRes.json()) as { application: { toggles: CatalogueToggle[] } };

  expect(requireToggle(catalogue.application.toggles, parentPath).enabled).toBe(false);
  expect(requireToggle(catalogue.application.toggles, childPath).enabled).toBe(true);

  await rootContext.close();
});
