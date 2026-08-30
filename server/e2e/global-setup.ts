import { request } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_STATE, ROOT_STATE, writeFixtures } from "./fixtures";
import { E2E_BASE_URL, E2E_DB_DIR } from "./playwright.config";

const ROOT_PASSWORD_FILE = join(E2E_DB_DIR, "initial-root-password.txt");
const ROOT_USERNAME = "root";
const ROOT_NEW_PASSWORD = "e2eRootPass1";
const ADMIN_USERNAME = "e2e-admin";
const ADMIN_NEW_PASSWORD = "e2eAdminPass1";
const TOGGLE_PATH = "feature.leaf";

async function waitForServerReady(): Promise<void> {
  const ctx = await request.newContext({ baseURL: E2E_BASE_URL });
  const deadline = Date.now() + 25_000;
  try {
    for (;;) {
      try {
        const res = await ctx.get("/ready");
        if (res.ok()) return;
      } catch {
        // servidor ainda não aceita conexões — tenta de novo
      }
      if (Date.now() > deadline) throw new Error("server did not become ready in time");
      await new Promise((r) => setTimeout(r, 300));
    }
  } finally {
    await ctx.dispose();
  }
}

// InitializeRootUser (auth_usecase.go) escreve a senha gerada, em texto puro + \n, em
// <dir de DB_PATH>/initial-root-password.txt, ANTES do listener HTTP subir — /ready responder
// já garante que o arquivo existe. Só é apagado depois que a troca de senha forçada é concluída,
// então precisa ser lido antes disso.
function readGeneratedRootPassword(): string {
  if (!existsSync(ROOT_PASSWORD_FILE)) {
    throw new Error(`expected root password file at ${ROOT_PASSWORD_FILE}, not found`);
  }
  return readFileSync(ROOT_PASSWORD_FILE, "utf-8").trim();
}

export default async function globalSetup(): Promise<void> {
  await waitForServerReady();

  mkdirSync(join(__dirname, ".auth"), { recursive: true });

  const generatedRootPassword = readGeneratedRootPassword();
  const ctx = await request.newContext({ baseURL: E2E_BASE_URL });

  try {
    // 1. Primeiro login de root (senha gerada) -> força troca -> loga de novo com a senha fixa
    //    do e2e, que os specs vão reusar via storageState.
    const firstLogin = await ctx.post("/api/auth/login", {
      data: { username: ROOT_USERNAME, password: generatedRootPassword },
    });
    if (!firstLogin.ok()) throw new Error(`root first login failed: ${firstLogin.status()} ${await firstLogin.text()}`);
    const firstLoginBody = await firstLogin.json();
    if (!firstLoginBody.must_change_password) {
      throw new Error("expected root to require a forced password change on first login");
    }

    const changeRes = await ctx.post("/api/auth/change-password-first-time", {
      data: { current_password: generatedRootPassword, new_password: ROOT_NEW_PASSWORD },
    });
    if (!changeRes.ok()) throw new Error(`root forced password change failed: ${changeRes.status()} ${await changeRes.text()}`);

    const rootLogin = await ctx.post("/api/auth/login", {
      data: { username: ROOT_USERNAME, password: ROOT_NEW_PASSWORD },
    });
    if (!rootLogin.ok()) throw new Error(`root re-login failed: ${rootLogin.status()} ${await rootLogin.text()}`);
    await ctx.storageState({ path: ROOT_STATE });

    // 2. Fixtures: time, aplicação, toggle (criado desabilitado — a jornada de e2e liga ele),
    //    e um usuário admin escopado ao time. Tudo criado com o workflow de aprovação ainda
    //    desligado (default de fábrica) — cada spec liga a aprovação sozinho quando precisa.
    const teamRes = await ctx.post("/api/teams", { data: { name: "E2E Team", description: "Created by Playwright global-setup" } });
    if (!teamRes.ok()) throw new Error(`create team failed: ${teamRes.status()} ${await teamRes.text()}`);
    const teamId: string = (await teamRes.json()).team.id;

    const appRes = await ctx.post("/api/applications", { data: { name: "E2E App", team_id: teamId } });
    if (!appRes.ok()) throw new Error(`create application failed: ${appRes.status()} ${await appRes.text()}`);
    const appId: string = (await appRes.json()).id;

    const createToggleRes = await ctx.post(`/api/applications/${appId}/toggles`, { data: { toggle: TOGGLE_PATH } });
    if (!createToggleRes.ok()) throw new Error(`create toggle failed: ${createToggleRes.status()} ${await createToggleRes.text()}`);

    const flatTogglesRes = await ctx.get(`/api/applications/${appId}/toggles`);
    if (!flatTogglesRes.ok()) throw new Error(`list toggles failed: ${flatTogglesRes.status()} ${await flatTogglesRes.text()}`);
    const flatToggles: Array<{ id: string; path: string }> = await flatTogglesRes.json();
    const leaf = flatToggles.find((t) => t.path === TOGGLE_PATH);
    if (!leaf) throw new Error(`expected a toggle with path "${TOGGLE_PATH}", got: ${JSON.stringify(flatToggles)}`);
    const toggleId = leaf.id;

    // Toggles novos nascem sempre enabled (docs/rest-flow.md §7) — desliga via o endpoint
    // recursivo pra que a jornada de "Enable toggle" tenha um estado inicial significativo.
    const disableRes = await ctx.put(`/api/applications/${appId}/toggle/${toggleId}`, { data: { enabled: false } });
    if (!disableRes.ok()) throw new Error(`initial toggle disable failed: ${disableRes.status()} ${await disableRes.text()}`);

    const userRes = await ctx.post("/api/users", {
      data: { username: ADMIN_USERNAME, role: "admin", team_id: teamId, is_approver: false },
    });
    if (!userRes.ok()) throw new Error(`create admin user failed: ${userRes.status()} ${await userRes.text()}`);
    const adminGeneratedPassword: string = (await userRes.json()).password;

    // 3. Loga como o admin recém-criado (mesma dança de troca forçada) e salva o storageState dele.
    const adminCtx = await request.newContext({ baseURL: E2E_BASE_URL });
    try {
      const adminFirstLogin = await adminCtx.post("/api/auth/login", {
        data: { username: ADMIN_USERNAME, password: adminGeneratedPassword },
      });
      if (!adminFirstLogin.ok()) throw new Error(`admin first login failed: ${adminFirstLogin.status()} ${await adminFirstLogin.text()}`);

      const adminChangeRes = await adminCtx.post("/api/auth/change-password-first-time", {
        data: { current_password: adminGeneratedPassword, new_password: ADMIN_NEW_PASSWORD },
      });
      if (!adminChangeRes.ok()) throw new Error(`admin forced password change failed: ${adminChangeRes.status()} ${await adminChangeRes.text()}`);

      const adminLogin = await adminCtx.post("/api/auth/login", {
        data: { username: ADMIN_USERNAME, password: ADMIN_NEW_PASSWORD },
      });
      if (!adminLogin.ok()) throw new Error(`admin re-login failed: ${adminLogin.status()} ${await adminLogin.text()}`);
      await adminCtx.storageState({ path: ADMIN_STATE });
    } finally {
      await adminCtx.dispose();
    }

    writeFixtures({
      teamId,
      appId,
      toggleId,
      togglePath: TOGGLE_PATH,
      rootUsername: ROOT_USERNAME,
      rootPassword: ROOT_NEW_PASSWORD,
      adminUsername: ADMIN_USERNAME,
      adminPassword: ADMIN_NEW_PASSWORD,
    });
  } finally {
    await ctx.dispose();
  }
}
