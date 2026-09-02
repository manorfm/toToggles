// Port de duas funções reais de users.jsx (decodificado do bundle comprimido em
// docs/toToggle.html — ver o header de lib/toggleLeaves.ts pro método), usadas pelo UserModal
// real pra derivar o username sugerido a partir do nome completo digitado, e pelos initials
// mostrados no avatar de UserRow/AuditRow. entity.User não tinha um campo Name até esta rodada
// (server/CLAUDE.md) — sem ele, UserRow mostrava só "@username" e o audit trail computava
// initials a partir do username (base errada: o protótipo sempre deriva initials do NOME, não
// do username — "Ana Ribeiro" → "AR", não as duas primeiras letras de "ana.ribeiro").

// slugUsername("Ana Ribeiro") -> "ana.ribeiro": minúsculo, sem acento, não-alfanumérico vira
// ".", colapsado, sem ponto nas pontas, só os 2 primeiros segmentos (nome + 1º sobrenome).
export function slugUsername(name: string): string {
  return (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "")
    .split(".")
    .slice(0, 2)
    .join(".");
}

// initialsOf("Ana Ribeiro") -> "AR": primeira letra dos 2 primeiros nomes, maiúscula.
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
