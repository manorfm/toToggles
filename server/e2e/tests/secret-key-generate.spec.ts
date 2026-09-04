import { expect, test } from "@playwright/test";
import { ADMIN_STATE, readFixtures, ROOT_STATE } from "../fixtures";
import { confirmApprovalIntercept, ensureSwitchOff, ensureSwitchOn, goToApprovalSettings } from "../helpers";

// Reusa a aplicação compartilhada — o botão mostra "Generate service key" (nenhuma chave ainda,
// estado vazio) ou "Rotate key" (já existe uma, ex. de approval-secret-key-delete.spec.ts rodando
// antes numa suite completa) dependendo do que outro spec já fez neste mesmo servidor/banco —
// confirmado em components/SecretKeySection.tsx, nunca "Generate key"/"Regenerate" (rótulos
// antigos, já não existem). O regex cobre os dois rótulos reais de propósito, pra não depender da
// ordem de execução dos arquivos. Ancorado (^...$) pra não também casar "Generate new key" (o
// botão do card "Lost the key?", que também dispara handleGenerate mas não deve ser ambíguo aqui).
// Sem escopo de #service-key-section (não existe mais — id de âncora de scroll de uma fase
// anterior à reescrita em abas de verdade, ver server/CLAUDE.md): a aba "Toggles" fica hidden
// enquanto "Service key" está ativa, então não há botão concorrente pra desambiguar.
const GENERATE_OR_ROTATE = /^(Generate service key|Rotate key)$/i;

test.describe("secret key — generate/regenerate", () => {
  test("without approval: applies immediately and shows the reveal-once modal", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await goToApprovalSettings(rootPage);
    await ensureSwitchOff(rootPage.getByRole("button", { name: "Sistema de aprovação" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/applications/${fixtures.appId}?tab=keys`);
    await adminPage.getByRole("button", { name: GENERATE_OR_ROTATE }).click();

    await expect(adminPage.getByText("Service key generated")).toBeVisible();
    await expect(adminPage.locator(".skey-val")).toContainText("sk_");
    await adminPage.locator(".skey-ack input[type=checkbox]").check();
    await adminPage.getByRole("button", { name: /I've saved the key/i }).click();

    await expect(adminPage.getByRole("button", { name: "Rotate key" })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "Revoke", exact: true })).toBeVisible();

    await rootContext.close();
    await adminContext.close();
  });

  test("with approval: pending until root approves, then a key exists", async ({ browser }) => {
    const fixtures = readFixtures();
    const rootContext = await browser.newContext({ storageState: ROOT_STATE });
    const rootPage = await rootContext.newPage();
    await goToApprovalSettings(rootPage);
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Sistema de aprovação" }));
    await ensureSwitchOn(rootPage.getByRole("button", { name: "Generate secret key" }));

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/applications/${fixtures.appId}?tab=keys`);
    await adminPage.getByRole("button", { name: GENERATE_OR_ROTATE }).click();
    await confirmApprovalIntercept(adminPage);

    await expect(adminPage.getByText(/aguardando aprovação/i)).toBeVisible();
    // A chave pendente É revelada aqui mesmo — confirmado em SecretKeySection.tsx#handleGenerate
    // + GeneratedKeyModal.tsx: o registro já existe (inativo) e este é o ÚNICO momento em que
    // alguém vai ver o valor em texto puro (docs/rest-flow.md §8), então o modal mostra com o
    // título/aviso "pending approval" em vez de ficar oculto. Reconhece e fecha antes de seguir.
    await expect(adminPage.getByText("Service key generated — pending approval")).toBeVisible();
    await expect(adminPage.getByText(/it will not work yet/i)).toBeVisible();
    await adminPage.locator(".skey-ack input[type=checkbox]").check();
    await adminPage.getByRole("button", { name: /I've saved the key/i }).click();

    await rootPage.goto("/approvals");
    await rootPage.getByRole("button", { name: "Pending" }).click();
    const pendingRow = rootPage.locator(".appr-row", { hasText: "Generate secret key" });
    await expect(pendingRow).toBeVisible();
    await pendingRow.getByRole("button", { name: "Aprovar" }).click();
    await expect(pendingRow).toHaveCount(0);

    // A chave em si nunca é exposta pro admin depois (foi gerada de forma assíncrona, fora da
    // sessão dele) — só confirmamos que agora existe uma (docs/rest-flow.md: plain_key só existe
    // na resposta síncrona de quem gera).
    await adminPage.reload();
    await expect(adminPage.getByRole("button", { name: "Rotate key" })).toBeVisible();

    await rootContext.close();
    await adminContext.close();
  });
});
