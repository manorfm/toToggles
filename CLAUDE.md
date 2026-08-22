# ToToggle — Monorepo Harness

ToToggle é uma plataforma de feature toggles/flags. Este é um **monorepo**: cada diretório é
independente (stack, dependências e ciclo de vida próprios), mas compartilham o mesmo contrato
de API.

```
toToggles/
├── server/           # Monólito Go (Gin + GORM + SQLite) — API + frontend autocontido
├── totoggle_java/     # Client library Java/Kotlin (consome a API pública via secret key)
├── stress-tests/      # Testes de carga (Gatling/Kotlin) contra o server
└── docs/
    ├── rest-flow.md   # Contrato da API REST — fonte de verdade para qualquer integração
    └── toToggle.html  # Export estático do protótipo de design (não editar à mão — ver abaixo)
```

Decisão de arquitetura: **o server continua monolítico** (Go + SQLite, frontend servido pelo
próprio binário a partir de `server/static/`). Não introduza microserviços, um backend separado
para o frontend, ou um banco diferente de SQLite — isso é intencional, não uma lacuna a corrigir.

## Onde encontrar o quê

- Arquitetura interna do server (camadas, entidades, rotas, banco): `server/CLAUDE.md`.
- Contrato de API (todas as rotas, request/response, roles, approval workflow): `docs/rest-flow.md`.
  Trate como a fonte de verdade ao consumir ou expor endpoints — mais confiável que ler o handler
  isolado, porque documenta comportamento entre camadas (ex.: cascata de herança de toggles,
  caveat de cookie `SameSite=Strict`).
- Client Java/Kotlin: `totoggle_java/README.md`.
- Testes de carga: `stress-tests/README.md`.

## Frontend — reescrita em andamento

O frontend atual em `server/static/` (`index.html`, `script.js` ~5100 linhas, `styles.css` ~5500
linhas) é um monólito de arquivo único, difícil de manter, e está sendo **substituído por
completo**. O design system foi totalmente reformulado; o protótipo novo está carregado no MCP
`design-graph`, não no HTML antigo.

**Regra obrigatória**: qualquer tarefa que crie ou altere algo em `server/static/` (ou o que vier
a substituí-lo) deve primeiro consultar o MCP `design-graph` para reconstruir a tela/componente a
partir do protótipo — nunca copiar padrões do frontend legado nem inventar layout/estilo. Detalhes
do fluxo completo estão na skill `design-graph-frontend`.

O frontend permanece **autocontido e servido pelo próprio server Go** (mesma origem, sem CORS/SPA
separada) — essa restrição segue valendo na reescrita; veja o caveat de `SameSite=Strict` em
`docs/rest-flow.md` antes de propor um frontend em origem separada.

## Skills e plugins configurados

- `server/.claude/skills/` — convenções de backend Go, escopadas ao diretório `server/`:
  arquitetura (Clean Architecture), Gin, GORM/SQLite, qualidade/idiomas de Go
  (`golang-code-quality`), segurança (`security-go-web`) e testes com testify (com cobertura
  mínima e testes de integração via `httptest`+SQLite in-memory).
- `.claude/skills/design-graph-frontend/` — regra de consulta ao design-graph antes de trabalho
  de UI, escopada ao repo inteiro (a reescrita do frontend ainda não tem diretório definitivo).
- Plugins habilitados em `.claude/settings.json`: `gopls-lsp` (inteligência de código Go — requer
  `gopls` instalado via `go install golang.org/x/tools/gopls@latest`, já feito neste ambiente) e
  `frontend-design` (qualidade/estética na implementação da UI reformulada).
