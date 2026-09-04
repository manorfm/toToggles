import type { APIRequestContext, Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// Padroniza a desambiguação "botão que abre um modal" vs. "botão de confirmar dentro do modal" —
// vários fluxos reusam o mesmo texto pros dois (ex.: header "Criar usuário" + submit "Criar
// usuário" em UserModal; "Add member" + "Add member" em AddMemberModal), o que já causou
// violações de strict mode escritas ad hoc, cada spec inventando sua própria forma de escopar
// (`.modal`, filtros de div, etc.). `data-testid="modal-scrim"` (components/Modal.tsx) é o único
// data-testid do app — usado aqui de propósito como o único ponto de escopo pra "dentro do modal
// aberto agora", já que o app nunca abre mais de um simultaneamente. `dialogTitle` é opcional e
// só serve pra também confirmar QUAL modal está aberto (ex. distinguir "Delete toggle" de
// "Delete application", ambos com um botão "Delete").
export function modalButton(page: Page, name: string, options?: { dialogTitle?: string }): Locator {
  const scrim = page.getByTestId("modal-scrim");
  const scope = options?.dialogTitle ? scrim.filter({ hasText: options.dialogTitle }) : scrim;
  return scope.getByRole("button", { name, exact: true });
}

// v2.6: toda ação approval-aware agora mostra um intercept ("Approval required" — Action/
// Target/Expires: 7 days) ANTES de submeter, em vez de só reagir ao 202 depois (ver
// hooks/useApprovalIntercept.ts). Confirma que o intercept apareceu e clica "Send for approval",
// que dispara a chamada de verdade — o passo que todo spec desta suíte que dispara uma ação
// approval-aware pela UI (não direto por API) precisa entre o clique original e o "aguardando
// aprovação" que só aparece depois da resposta 202.
export async function confirmApprovalIntercept(page: Page): Promise<void> {
  await page.getByText("Approval required").waitFor();
  await page.getByRole("button", { name: "Send for approval" }).click();
}

export interface StandaloneServer {
  baseURL: string;
  dbDir: string;
  stop(): Promise<void>;
}

// Sobe uma instância TOTALMENTE isolada do servidor (porta e banco próprios, fora do webServer
// compartilhado do playwright.config.ts) — pro único cenário que a suíte principal não cobre: a
// jornada real de primeiro boot (senha gerada de root só existe uma vez, e global-setup já
// precisa consumi-la pra criar as fixtures compartilhadas antes de qualquer teste rodar). Também
// serve de regressão pro bug real já encontrado: sem COOKIE_SECURE=false, o cookie de sessão
// nunca sobrevive sobre http:// puro e a troca de senha forçada nunca "vinga" de verdade.
export async function startStandaloneServer(port: string): Promise<StandaloneServer> {
  const dbDir = mkdtempSync(join(tmpdir(), "totoggle-e2e-standalone-"));
  const dbPath = join(dbDir, "toggles.db");
  const baseURL = `http://127.0.0.1:${port}`;

  const child: ChildProcess = spawn("go", ["run", "main.go"], {
    cwd: join(__dirname, ".."),
    env: { ...process.env, SERVER_PORT: port, DB_PATH: dbPath, COOKIE_SECURE: "false" },
    stdio: "pipe",
  });

  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const res = await fetch(`${baseURL}/health`);
      if (res.ok) break;
    } catch {
      // ainda não subiu — tenta de novo
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error("standalone server did not become ready in time");
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return {
    baseURL,
    dbDir,
    async stop() {
      child.kill();
      await new Promise((r) => setTimeout(r, 200));
    },
  };
}

// Cria um usuário via API (como root) e completa a dança de primeiro login + troca de senha
// obrigatória, devolvendo um BrowserContext já autenticado como esse usuário. Extraído porque
// approval-cross-team-isolation.spec.ts precisa disso duas vezes (um admin por team) — a mesma
// dança que non-root-approver.spec.ts também faz inline uma única vez.
export async function createAndLoginUser(
  browser: Browser,
  rootRequest: APIRequestContext,
  opts: { username: string; teamId: string; role?: "admin" | "user"; isApprover?: boolean }
): Promise<BrowserContext> {
  const createRes = await rootRequest.post("/api/users", {
    data: { name: opts.username, username: opts.username, role: opts.role ?? "admin", team_id: opts.teamId, is_approver: opts.isApprover ?? false },
  });
  if (!createRes.ok()) throw new Error(`create user "${opts.username}" failed: ${createRes.status()} ${await createRes.text()}`);
  const generatedPassword: string = (await createRes.json()).password;
  const newPassword = `${opts.username}Temp1`;

  const context = await browser.newContext();
  const firstLogin = await context.request.post("/api/auth/login", { data: { username: opts.username, password: generatedPassword } });
  if (!firstLogin.ok()) throw new Error(`first login for "${opts.username}" failed: ${firstLogin.status()} ${await firstLogin.text()}`);

  const changeRes = await context.request.post("/api/auth/change-password-first-time", {
    data: { current_password: generatedPassword, new_password: newPassword },
  });
  if (!changeRes.ok()) throw new Error(`forced password change for "${opts.username}" failed: ${changeRes.status()} ${await changeRes.text()}`);

  const login = await context.request.post("/api/auth/login", { data: { username: opts.username, password: newPassword } });
  if (!login.ok()) throw new Error(`re-login for "${opts.username}" failed: ${login.status()} ${await login.text()}`);

  return context;
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
