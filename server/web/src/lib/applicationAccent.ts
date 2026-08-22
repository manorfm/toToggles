// O protótipo colore o glifo de cada aplicação com um hue por-app: os estilos
// reais (get_component_spec("App")) usam `oklch(0.75 0.15 ${hue})` /
// `oklch(0.75 0.15 ${hue} / 0.15)` — a fórmula veio do design-graph, o hash que
// deriva `hue` a partir do id não (é opaco/compilado no protótipo), então usamos
// um hash determinístico simples aqui: mesma aplicação sempre com a mesma cor.
export interface ApplicationAccent {
  accent: string;
  soft: string;
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
