// O protótipo colore o glifo de cada aplicação com um hue por-app — a fórmula em si
// (`oklch(0.75 0.15 ${hue})` / `oklch(0.75 0.15 ${hue} / 0.15)`) já vinha confirmada do
// design-graph, mas de onde `hue` saía não: uma fase anterior desta reescrita assumiu um hash
// determinístico do `id` (cobrindo os 360° inteiros) por falta da fonte real. Decodificando o
// bundle comprimido (`app.jsx`, ver server/CLAUDE.md) a fórmula real apareceu:
// `const HUES = [158, 230, 28, 274, 330, 195]; const hue = HUES[apps.length % HUES.length];` —
// uma paleta CURADA de 6 cores, ciclando pela ORDEM DE CRIAÇÃO da aplicação (quantas apps já
// existiam quando esta foi criada), gravada uma vez e nunca recalculada depois — não um hash do
// id cobrindo o círculo de cor inteiro. Substituído por HUES_CYCLE, indexado pela posição da
// app na lista ordenada por created_at ascendente (ver AppCard#accentIndex).
export const HUES_CYCLE = [158, 230, 28, 274, 330, 195];

export interface ApplicationAccent {
  accent: string;
  soft: string;
}

// Port do algoritmo real de app.jsx (decodificado do bundle comprimido em docs/toToggle.html —
// ver o header de lib/toggleLeaves.ts): `name.split(/\s+/).map(w => w[0]).slice(0, 2).join("")
// .toUpperCase() || "AP"`. Usado tanto na criação (novo glifo) quanto na exibição de apps já
// existentes, já que a API não persiste um glifo — é sempre derivado do nome atual.
export function applicationGlyph(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return initials || "AP";
}

// index = posição da aplicação entre as demais em ordem de criação (0 = a mais antiga) — não o
// índice da lista como exibida (GET /applications devolve mais recente primeiro; ver
// lib/applicationAccent.ts#creationOrderIndex, que resolve essa posição real).
export function applicationAccent(index: number): ApplicationAccent {
  const hue = HUES_CYCLE[((index % HUES_CYCLE.length) + HUES_CYCLE.length) % HUES_CYCLE.length];
  return {
    accent: `oklch(0.75 0.15 ${hue})`,
    soft: `oklch(0.75 0.15 ${hue} / 0.15)`,
  };
}

// Deriva, pra cada aplicação, sua posição em ordem de criação (created_at ascendente) — a mesma
// posição que o protótipo usa (`apps.length` no momento da criação) pra indexar HUES_CYCLE, já
// que a API não persiste um `hue` por aplicação (nenhum campo assim existe no backend). Devolve
// um Map id -> index pra AppCard consultar sem recalcular a ordenação por card.
export function creationOrderIndex(applications: { id: string; created_at: string }[]): Map<string, number> {
  const sorted = [...applications].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const index = new Map<string, number>();
  sorted.forEach((app, i) => index.set(app.id, i));
  return index;
}
