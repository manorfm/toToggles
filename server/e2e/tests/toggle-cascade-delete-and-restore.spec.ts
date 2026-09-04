import { expect, test } from "@playwright/test";
import { readFixtures } from "../fixtures";
import { createToggle } from "../helpers";

// v2.6 §3.4/4.1: DELETE deixou de recusar um nó com filhos (T0008 foi removido) — agora apaga o
// nó alvo e toda a subárvore descendente num soft-delete só, reversível via POST .../restore.
// Sem `page`/browser de propósito, como no spec que este substituiu: a UI atual não tem NENHUM
// jeito de disparar o delete de um nó não-folha (o ícone de lixeira só existe em ToggleCard, que
// renderiza uma folha por card) — cobrir isso via clique exigiria inventar uma interação que não
// existe no app real. O valor de e2e aqui é rodar contra o BINÁRIO REAL (via `request`, que fala
// com o processo subido pelo webServer), não contra o harness de teste do Go.
//
// Namespace dedicado ("cascadedelete", nunca "e2e.*"): apaga um ancestral de verdade, o que
// afetaria qualquer toggle de outro spec que reusasse o mesmo prefixo compartilhado.
test.describe("DELETE toggle cascades and is reversible", () => {
  test("deleting a non-leaf toggle soft-deletes it and its whole subtree, archives it, and restore brings both back", async ({
    request,
  }) => {
    const fixtures = readFixtures();
    const loginRes = await request.post("/api/auth/login", {
      data: { username: fixtures.rootUsername, password: fixtures.rootPassword },
    });
    expect(loginRes.ok()).toBeTruthy();

    await createToggle(request, fixtures.appId, "cascadedelete.branch.leaf");

    const flatBefore: Array<{ id: string; path: string }> = await (
      await request.get(`/api/applications/${fixtures.appId}/toggles`)
    ).json();
    const root = flatBefore.find((t) => t.path === "cascadedelete");
    const branch = flatBefore.find((t) => t.path === "cascadedelete.branch");
    const leaf = flatBefore.find((t) => t.path === "cascadedelete.branch.leaf");
    if (!root || !branch || !leaf) throw new Error(`expected all 3 nodes to exist, got: ${JSON.stringify(flatBefore)}`);

    const deleteRes = await request.delete(`/api/applications/${fixtures.appId}/toggles/${branch.id}`);
    expect(deleteRes.status()).toBe(200);

    const flatAfterDelete: Array<{ path: string }> = await (
      await request.get(`/api/applications/${fixtures.appId}/toggles`)
    ).json();
    // O nó alvo e o descendente somem da leitura normal — mas o ancestral nunca é tocado (delete
    // não faz bubble-up, ver docs/rest-flow.md §7).
    expect(flatAfterDelete.some((t) => t.path === "cascadedelete.branch")).toBe(false);
    expect(flatAfterDelete.some((t) => t.path === "cascadedelete.branch.leaf")).toBe(false);
    expect(flatAfterDelete.some((t) => t.path === "cascadedelete")).toBe(true);

    const archivedRes = await request.get(`/api/applications/${fixtures.appId}/toggles/archived`);
    expect(archivedRes.ok()).toBeTruthy();
    const archivedBody: { toggles?: Array<{ id: string; path: string; deleted_by_name: string }> } = await archivedRes.json();
    // Uma raiz de arquivamento só pro nó explicitamente apagado ("branch") — o descendente
    // cascateado ("leaf") não vira uma entrada separada.
    const archivedEntry = archivedBody.toggles?.find((t) => t.id === branch.id);
    expect(archivedEntry).toBeDefined();
    expect(archivedEntry?.path).toBe("cascadedelete.branch");
    expect(archivedEntry?.deleted_by_name).toBe(fixtures.rootUsername);

    const restoreRes = await request.post(`/api/applications/${fixtures.appId}/toggles/${branch.id}/restore`);
    expect(restoreRes.ok()).toBeTruthy();

    const flatAfterRestore: Array<{ path: string }> = await (
      await request.get(`/api/applications/${fixtures.appId}/toggles`)
    ).json();
    expect(flatAfterRestore.some((t) => t.path === "cascadedelete.branch")).toBe(true);
    expect(flatAfterRestore.some((t) => t.path === "cascadedelete.branch.leaf")).toBe(true);

    const archivedAfterRestore: { toggles?: Array<{ id: string }> } = await (
      await request.get(`/api/applications/${fixtures.appId}/toggles/archived`)
    ).json();
    // Slice nil no Go não serializa como `[]` — "toggles" some do corpo quando não há mais nada
    // arquivado (mesmo cuidado já documentado noutros endpoints opcionais deste backend).
    expect((archivedAfterRestore.toggles ?? []).some((t) => t.id === branch.id)).toBe(false);
  });
});
