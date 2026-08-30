import { expect, test } from "@playwright/test";
import { readFixtures, ROOT_STATE } from "../fixtures";
import { createToggle } from "../helpers";

// Usa um namespace de path totalmente dedicado ("cascadetest", nunca "e2e.*") — este teste
// desliga um ANCESTRAL, o que cascateia pra todo descendente que exista sob ele. Reusar o
// prefixo "e2e" compartilhado por outros specs desligaria toggles de outros testes rodando na
// mesma suite completa (todos "e2e.*" reusam o mesmo nó ancestral "e2e", criado uma vez e
// reaproveitado — ver docs/rest-flow.md §7, "segmentos que já existem são reusados").
test("disabling an ancestor cascades to the leaf's displayed status (not just its own bit)", async ({ browser }) => {
  const fixtures = readFixtures();
  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const rootPage = await rootContext.newPage();

  await createToggle(rootContext.request, fixtures.appId, "cascadetest.branch.leaf");

  await rootPage.goto(`/applications/${fixtures.appId}`);
  const card = rootPage.locator(".tg-card", { hasText: "cascadetest.branch.leaf" });
  const leafSwitch = card.getByRole("switch", { name: "cascadetest.branch.leaf" });

  // Estado inicial: tudo ligado (toggles nascem enabled) — verde, "Active".
  await expect(leafSwitch).toHaveAttribute("aria-checked", "true");
  await expect(card).toContainText("Active");

  // Clica no segmento ANCESTRAL "cascadetest" (não na folha) — abre o EditToggleDrawer pra esse
  // nó especificamente, cada segmento do path é seu próprio link (ToggleCard.tsx).
  await card.locator(".seg-link", { hasText: "cascadetest" }).click();

  await rootPage.getByRole("switch", { name: "Status" }).click();
  await rootPage.getByRole("button", { name: "Save changes" }).click();

  // A ESCRITA foi não-recursiva (PUT plural — só o bit próprio de "cascadetest" mudou), mas a
  // LEITURA cascateia: a folha nunca teve seu próprio bit tocado, e ainda assim aparece
  // desligada/vermelha porque um ancestral está off (docs: "cascading validation").
  await expect(card).toContainText("Branch disabled");
  await expect(leafSwitch).toHaveAttribute("aria-checked", "false");
  await expect(leafSwitch).toBeDisabled(); // ancestorsOn=false trava o switch da folha

  await rootContext.close();
});
