import { expect, test } from "@playwright/test";
import { ROOT_STATE } from "../fixtures";
import { modalButton } from "../helpers";

// Nenhuma dessas rotas é approval-aware (docs/rest-flow.md) — uma variante só, sempre aplica na
// hora. Um fluxo administrativo completo e realista: root cria um time novo, cria uma pessoa
// (já como aprovadora do time original dela), depois adiciona essa mesma pessoa a este time novo
// também (multi-time é permitido) e a designa aprovadora aqui também — dois team_users
// independentes para o mesmo usuário.
test("root creates a team, creates a user, and manages team membership/approver status", async ({ browser }) => {
  const rootContext = await browser.newContext({ storageState: ROOT_STATE });
  const rootPage = await rootContext.newPage();

  // 1. Criar time.
  await rootPage.goto("/teams");
  await rootPage.getByRole("button", { name: "New team" }).click();
  await rootPage.locator("#team-name").fill("E2E Second Team");
  await rootPage.locator("#team-description").fill("Created by the teams-and-users e2e spec");
  await rootPage.getByRole("button", { name: "Create team" }).click();
  await expect(rootPage.getByText("E2E Second Team")).toBeVisible();

  // 2. Criar usuário — admin, aprovador, no time "E2E Team" (o time da fixture compartilhada,
  // não o recém-criado).
  await rootPage.goto("/users");
  await rootPage.getByRole("button", { name: "Criar usuário" }).click();
  await rootPage.locator("#new-user-name").fill("E2E Teams User");
  await rootPage.locator("#new-user-username").fill("e2e-teams-user");
  await rootPage.locator("#new-user-team").selectOption({ label: "E2E Team" });
  await rootPage.locator("#new-user-role").selectOption("admin");
  await rootPage.getByRole("switch", { name: "Aprovador do time" }).click();
  await modalButton(rootPage, "Criar usuário").click();

  await expect(rootPage.getByText("Usuário criado")).toBeVisible();
  await rootPage.locator(".skey-ack input[type=checkbox]").check();
  await rootPage.getByRole("button", { name: /entendi, já anotei/i }).click();
  await expect(rootPage.getByText("e2e-teams-user")).toBeVisible();

  // 3. Adicionar esse mesmo usuário ao time novo, e designá-lo aprovador AQUI também (é um
  // team_users independente do primeiro — is_approver não é global no usuário).
  // TeamsScreen envolve cada time num <div> sem classe própria (TeamRow + TeamMembersSection
  // como irmãos) — escopa pelo <div> mais interno que contém tanto o nome do time quanto o botão
  // "Add member" daquele bloco (.last() pega o ancestral mais específico, não a página inteira).
  await rootPage.goto("/teams");
  const newTeamSection = rootPage
    .locator("div")
    .filter({ hasText: "E2E Second Team" })
    .filter({ has: rootPage.getByRole("button", { name: "Add member" }) })
    .last();
  await newTeamSection.getByRole("button", { name: "Add member" }).click();
  await rootPage.locator("#member-user").selectOption({ label: "e2e-teams-user" });
  await modalButton(rootPage, "Add member").click();

  // Escopado a newTeamSection: esse usuário já é membro (e aprovador) do time "E2E Team" também
  // — sem escopo, ".member" bateria nas duas seções da página.
  const memberRow = newTeamSection.locator(".member", { hasText: "e2e-teams-user" });
  await expect(memberRow).toBeVisible();
  const approverSwitch = memberRow.getByRole("switch", { name: "Aprovador" });
  await expect(approverSwitch).toHaveAttribute("aria-checked", "false"); // novo team_users, começa false
  await approverSwitch.click();
  await expect(approverSwitch).toHaveAttribute("aria-checked", "true");

  await rootContext.close();
});
