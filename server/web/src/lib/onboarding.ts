import { slugUsername } from "./userDisplay";

// v2.6 §6.7-6.9 — guided first-run setup wizard. Confirmado via design-graph
// (get_component_full("OnboardingModal")): `localStorage.getItem/setItem("totoggle_v2_onboarded",
// ...)` flips the sidebar nav label between "Getting started" and "Review setup" (see
// components/AppShell.tsx) — same resilience pattern as lib/favorites.ts (a browser without
// localStorage just always shows "Getting started", never crashes).
const ONBOARDING_KEY = "totoggle_v2_onboarded";

export function isOnboarded(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboarded(): void {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, "1");
  } catch {
    // Idem lib/favorites.ts — falhar silenciosamente é aceitável aqui.
  }
}

// Gera um username livre pro membro criado no passo "People" — o servidor gera a senha
// temporária (não há genTempPassword() aqui como no protótipo, que simulava tudo em memória);
// só o username precisa de sugestão client-side, já que POST /users exige um valor e o passo só
// pede o nome completo. Porta a lógica confirmada de obAddMember (app.jsx): slugUsername + sufixo
// numérico incremental até não colidir com nenhum username já existente.
export function suggestUsername(name: string, existingUsernames: string[]): string {
  const base = slugUsername(name) || `user${Math.random().toString(36).slice(2, 8)}`;
  if (!existingUsernames.includes(base)) return base;
  let i = 1;
  while (existingUsernames.includes(`${base}${i}`)) i++;
  return `${base}${i}`;
}

// Dedupe-by-name pros passos "Team" e "Application" (obCreateTeam/obCreateApp no protótipo real):
// reaproveita o registro já existente em vez de tentar criar um segundo com o mesmo nome — útil
// sobretudo pra "Review setup" (rodar o wizard de novo depois de já onboarded).
export function findByNameCaseInsensitive<T extends { name: string }>(list: T[], name: string): T | undefined {
  const target = name.toLowerCase();
  return list.find((item) => item.name.toLowerCase() === target);
}
