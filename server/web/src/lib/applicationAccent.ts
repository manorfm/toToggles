// O protótipo colore o glifo de cada aplicação com um hue por-app: os estilos
// reais (get_component_spec("App")) usam `oklch(0.75 0.15 ${hue})` /
// `oklch(0.75 0.15 ${hue} / 0.15)` — a fórmula veio do design-graph, o hash que
// deriva `hue` a partir do id não (é opaco/compilado no protótipo), então usamos
// um hash determinístico simples aqui: mesma aplicação sempre com a mesma cor.
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

export function applicationAccent(id: string): ApplicationAccent {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return {
    accent: `oklch(0.75 0.15 ${hue})`,
    soft: `oklch(0.75 0.15 ${hue} / 0.15)`,
  };
}
