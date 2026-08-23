# Documentação Técnica - ToToogle Server

## Visão Geral da Aplicação

ToToogle é uma plataforma completa de gerenciamento de feature toggles (feature flags) construída com Go e tecnologias web modernas. A aplicação segue princípios de Clean Architecture e Hexagonal Architecture, oferecendo controle granular de acesso baseado em usuários/times e suporte a regras avançadas de ativação.

## Arquitetura do Sistema

### Stack Tecnológica Principal
- **Backend**: Go 1.23+ com Gin Framework
- **Banco de Dados**: SQLite com GORM (ORM)
- **Frontend**: HTML5, CSS3, JavaScript Vanilla
- **Autenticação**: Session-based com cookies HTTP-only
- **Migrações**: Goose para versionamento do banco
- **Testes**: Go testing framework + testify
- **Containerização**: Docker com docker-compose

### Estrutura de Diretórios e Arquitetura

```
/home/manoel/workspace/toToogle/server/
├── main.go                              # Entry point da aplicação
├── go.mod/go.sum                       # Dependências Go
├── Makefile                            # Comandos de build/desenvolvimento
├── Dockerfile & docker-compose.yml     # Containerização
├── db/
│   ├── migrations/                     # Scripts SQL de migração
│   └── toggles.db                      # Banco SQLite
├── static/                             # Assets frontend (HTML/CSS/JS)
└── internal/app/                       # Código fonte principal
    ├── config/                         # Configuração e inicialização
    ├── domain/                         # Camada de domínio (Clean Architecture)
    │   ├── entity/                     # Entidades de negócio
    │   ├── auth/                       # Estratégias de autenticação
    │   └── repository/                 # Interfaces de repositório
    ├── usecase/                        # Camada de aplicação (lógica de negócio)
    ├── infrastructure/database/        # Implementações de repositório
    ├── handler/                        # Camada de apresentação (HTTP handlers)
    ├── middleware/                     # Middlewares HTTP
    └── router/                         # Configuração de rotas
```

## Entidades Principais do Domínio

### 1. User (Usuário)
- **Localização**: `internal/app/domain/entity/user.go`
- **Funcionalidades**:
  - Sistema de roles: `root`, `admin`, `user`
  - Autenticação com bcrypt
  - Controle de permissões hierárquico
  - Forçar troca de senha
  - Associação com teams via many-to-many

**Roles e Permissões**:
- `root`: Super administrador, pode gerenciar usuários
- `admin`: Pode visualizar, criar e alterar dados
- `user`: Apenas visualização (read-only)

### 2. Team (Time/Equipe)
- **Localização**: `internal/app/domain/entity/team.go`
- **Funcionalidades**:
  - Organização de usuários em grupos
  - Permissões granulares por aplicação: `read`, `write`, `admin`
  - Relacionamento many-to-many com Users e Applications
  - Validação de dados com regras de negócio

### 3. Application (Aplicação)
- **Localização**: `internal/app/domain/entity/application.go`
- **Funcionalidades**:
  - Container para feature toggles
  - Associação com teams via permissões
  - Contadores de toggles (ativo/inativo/total)
  - Identificação única via ULID

### 4. Toggle (Feature Toggle)
- **Localização**: `internal/app/domain/entity/toggle.go`
- **Funcionalidades**:
  - Estrutura hierárquica (parent-child)
  - Caminhos como `feature.new.dashboard`
  - Estado habilitado/desabilitado
  - Regras avançadas de ativação
  - Herança de estado dos toggles pais

### 5. ActivationRule (Regras de Ativação)
- **Localização**: `internal/app/domain/entity/activation_rule.go`
- **Tipos Suportados**:
  - `percentage`: Rollout percentual
  - `parameter`: Baseado em parâmetros
  - `user_id`: Usuários específicos
  - `ip`: Endereços IP
  - `country`: Países específicos
  - `time`: Horários específicos
  - `canary`: Releases canário

### 6. SecretKey (Chaves de API)
- **Localização**: `internal/app/domain/entity/secret_key.go`
- **Funcionalidades**:
  - Acesso público à API sem autenticação
  - Associação com aplicações específicas
  - Geração segura com prefixo `sk_`

## Camadas da Aplicação

### 1. Domain Layer (Domínio)
- **Entidades**: Lógica de negócio pura, sem dependências externas
- **Repositórios**: Interfaces para persistência
- **Validações**: Regras de negócio e validações

### 2. Use Case Layer (Aplicação)
- **Localização**: `internal/app/usecase/`
- **Responsabilidades**:
  - Orquestração da lógica de negócio
  - Coordenação entre repositórios
  - Implementação de casos de uso específicos

**Use Cases Principais**:
- `application_usecase.go`: CRUD de aplicações
- `toggle_usecase.go`: Gerenciamento de toggles e hierarquias
- `user_usecase.go`: Gerenciamento de usuários
- `team_usecase.go`: Gerenciamento de times
- `auth_usecase.go`: Autenticação e autorização
- `secret_key_usecase.go`: Gerenciamento de chaves API

### 3. Infrastructure Layer (Infraestrutura)
- **Localização**: `internal/app/infrastructure/database/`
- **Responsabilidades**:
  - Implementações concretas dos repositórios
  - Acesso ao banco de dados via GORM
  - Queries SQL complexas

### 4. Presentation Layer (Apresentação)
- **Handlers**: `internal/app/handler/`
- **Router**: `internal/app/router/`
- **Middleware**: `internal/app/middleware/`

## Sistema de Autenticação e Autorização

### Fluxo de Autenticação
1. Login via POST `/auth/login` com username/password
2. Validação de credenciais com bcrypt
3. Criação de sessão com cookie HTTP-only
4. Middleware de segurança valida sessões em rotas protegidas

### Middleware de Segurança
- **Localização**: `internal/app/middleware/security.go`
- **Funcionalidades**:
  - Validação de sessão
  - Controle de acesso baseado em roles
  - Proteção CSRF
  - Rate limiting (se implementado)

## API e Rotas

> ⚠️ **Toda a API vive sob `/api`** (ver "Separação API vs SPA" no final desta seção — mudança
> estrutural feita para resolver de vez a colisão entre rotas SPA e rotas de API que tinham o
> mesmo path). As listas abaixo já refletem os paths atuais.

### Rotas de Autenticação (Públicas)
- `POST /api/auth/login` - Login do usuário
- `POST /api/auth/logout` - Logout do usuário
- `POST /api/auth/change-password` - Alteração de senha

### Rotas de Usuários (Root Only)
- `POST /api/users` - Criar usuário
- `GET /api/users` - Listar usuários
- `PUT /api/users/:id` - Atualizar usuário
- `DELETE /api/users/:id` - Remover usuário

### Rotas de Times (Protegidas)
- `POST /api/teams` - Criar time
- `GET /api/teams` - Listar times
- `PUT /api/teams/:id` - Atualizar time
- `DELETE /api/teams/:id` - Remover time
- `POST /api/teams/:id/users` - Adicionar usuário ao time
- `DELETE /api/teams/:id/users/:userId` - Remover usuário do time
- `POST /api/teams/:id/approvers/:userId` - Designar/remover aprovador
- `GET /api/teams/:id/approvers` - Listar membros com status de aprovador

### Rotas de Aplicações (Protegidas)
- `POST /api/applications` - Criar aplicação
- `GET /api/applications` - Listar aplicações
- `PUT /api/applications/:id` - Atualizar aplicação
- `DELETE /api/applications/:id` - Remover aplicação

### Rotas de Toggles (Protegidas)
- `POST /api/applications/:id/toggles` - Criar toggle
- `GET /api/applications/:id/toggles` - Listar toggles (flat ou hierarchy)
- `PUT /api/applications/:id/toggles/:toggleId` - Atualizar toggle
- `DELETE /api/applications/:id/toggles/:toggleId` - Remover toggle
- `PUT /api/applications/:id/toggle/:toggleId` - Atualizar recursivamente

### API Pública (Secret Key)
- `GET /api/toggles` - Buscar toggles por secret key (Header: X-API-Key) — já vivia sob `/api`
  antes da reestruturação, serviu de modelo pra ela.

### Frontend (Protegido)
- `GET /` - Interface principal
- `GET /login` - Página de login
- `GET /change-password` - Página de alteração de senha
- `GET /static/*` - Assets estáticos

### Separação API vs SPA (`/api` como namespace único)

**Problema histórico**: o frontend novo (`server/web/`) é servido pelo mesmo host/porta que a
API, e várias telas reusavam o path exato de uma rota de API real — `GET /teams` era, ao mesmo
tempo, a tela de times E a rota que lista times; `GET /applications/:id` idem para o detalhe de
aplicação. `isAPIRoute()` (`static_handler.go`) decidia API-vs-SPA só pelo formato da URL, e
quando os dois paths eram literalmente o mesmo string, não havia heurística que resolvesse — um
hard refresh (ou link direto, F5, aba nova) nessas telas devolvia o JSON cru da API em vez da
casca do SPA. Essa classe de bug foi encontrada e corrigida em pontos isolados três vezes ao
longo da reescrita (`/toggle` vs `/toggles`, `/approval` vs `/approvals`), até o caso sem solução
por string (`/teams`, `/applications/:id`) forçar uma correção estrutural.

**Solução**: toda a API (sessão E secret key) foi movida pra debaixo de `/api` — inspirado no
próprio `/api/toggles` público, que já vivia lá desde sempre e nunca teve esse problema.
`isAPIRoute()` virou um único `strings.HasPrefix(path, "/api/")`; qualquer coisa fora disso é
SPA, sem exceção. Isso elimina a classe de bug inteira de uma vez — nenhuma rota nova, de API ou
SPA, pode colidir de novo, porque o namespace nunca se sobrepõe.

**O que isso tocou**:
- `internal/app/router/routes.go`: `protected`/`auth` viraram subgrupos de `api :=
  router.Group("/api")`.
- `internal/app/handler/static_handler.go`: `isAPIRoute()` simplificado; o bypass dedicado pra
  `/auth/` no `ServeStatic` foi removido (redundante agora — `/api/auth/...` já cai no boundary
  genérico). Os bypasses de `/login` e `/change-password` continuam existindo (não são sobre
  API-vs-SPA, são pra garantir que o handler dedicado de cada um — com sua própria validação —
  realmente rode em vez do fallback genérico do ServeStatic).
- `internal/app/middleware/security.go`: o cache-control anti-cache de dados autenticados
  checava só 3 paths exatos (`/applications`, `/applications/`, `/applications/:id/toggles`) —
  virou `strings.HasPrefix(path, "/api/")`, cobrindo a API inteira (antes `/teams`, `/users` etc.
  não tinham essa proteção).
- `internal/app/handler/auth_handler.go`: o gate de troca de senha obrigatória
  (`ValidateToken()`) exime a própria rota de troca de senha da bloqueio — o literal mudou de
  `/auth/change-password` pra `/api/auth/change-password`. Verificado ao vivo que a isenção
  continua funcionando (sem isso, um usuário marcado `must_change_password` ficaria travado sem
  conseguir nem trocar a senha).
- `server/web/src/api/client.ts`: `apiFetch()` agora prefixa `/api` automaticamente em toda
  chamada — ponto único, nenhum dos módulos em `api/*.ts` precisou saber do prefixo.
- `stress-tests/src/main/kotlin/setup/TestDataSetup.kt`: os 5 endpoints de setup usados antes de
  rodar carga (login, criar app, gerar secret, criar toggle, listar teams do usuário) atualizados
  pro novo prefixo. As simulações Gatling em si (`src/gatling/scala/...`) só batem em
  `/api/toggles`, que não mudou.
- `docs/rest-flow.md`: todo path documentado foi atualizado; adicionado um aviso no topo do
  documento explicando o namespace `/api` e o porquê.

**Achado incidental durante a verificação ao vivo**: `docs/rest-flow.md` documentava o status do
gate de troca de senha obrigatória como `412 Precondition Required` — mas o handler usa
`http.StatusPreconditionRequired`, que é **428** (RFC 6585), não 412 (que é "Precondition
Failed", RFC 7232, um código diferente). Confirmado ao vivo contra o servidor real. Corrigido na
doc.

## Banco de Dados

### Sistema de Migrações
- **Ferramenta**: Goose
- **Localização**: `db/migrations/`
- **Comandos**:
  - `make migrate-up` - Aplicar migrações
  - `make migrate-down` - Reverter última migração
  - `make migrate-status` - Status das migrações

### Histórico de Migrações
1. `20230703_create_applications_and_toggles.sql` - Estrutura inicial
2. `20241213_add_activation_rules.sql` - Regras de ativação
3. `20241214_add_auth_system.sql` - Sistema de autenticação
4. `20250814_add_teams_system.sql` - Sistema de times
5. `20250815_add_user_management_features.sql` - Recursos de gerenciamento

### Relacionamentos Principais
- **Users ↔ Teams**: Many-to-Many (`team_users`)
- **Teams ↔ Applications**: Many-to-Many com permissões (`team_applications`)
- **Applications → Toggles**: One-to-Many
- **Toggles → Toggles**: Self-referencing (parent-child)
- **Applications → SecretKeys**: One-to-Many

## Comandos de Desenvolvimento

### Makefile Commands
```bash
make help          # Mostrar ajuda
make dev           # Desenvolvimento (migrate + run)
make run           # Executar aplicação
make build         # Compilar binário
make test          # Executar testes
make clean         # Limpar binário e banco
make migrate-up    # Aplicar migrações
make migrate-down  # Reverter migração
make migrate-status # Status das migrações
make docker-build  # Build Docker
make docker-run    # Executar container
```

### Comandos de Teste
```bash
go test ./...                           # Todos os testes
go test ./internal/app/domain/entity    # Testes de entidades
go test -coverprofile=coverage.out ./...  # Com coverage
```

## Configuração e Inicialização

### Entry Point
- **Arquivo**: `main.go`
- **Fluxo**:
  1. Inicialização do logger
  2. Inicialização da configuração (`config.Init()`)
  3. Inicialização do router (`router.Initialize()`)

### Configuração
- **Localização**: `internal/app/config/`
- **Arquivos**:
  - `config.go` - Configuração principal
  - `db.go` - Setup do banco de dados
  - `logger.go` - Configuração de logs

## Frontend

> ⚠️ **Em reescrita completa.** O frontend antigo (HTML/CSS/JS monolítico vanilla, sem framework)
> foi **removido por completo** — não existe mais em `static/`. Está sendo reconstruído do zero em
> `server/web/` (React + Vite + TypeScript) a partir do design system reformulado. Antes de tocar em
> qualquer tela, veja o harness em `../CLAUDE.md` e siga a skill `design-graph-frontend` (consultar
> o MCP `design-graph` como fonte de verdade do novo design — nunca reaproveitar padrões do frontend
> antigo, que não existe mais nem deveria servir de referência).

### Stack Frontend
- **React + TypeScript + Vite**, código-fonte em `server/web/`.
- Build gera assets estáticos direto em `static/app/` (`vite.config.ts`: `base`/`outDir`) — o Go
  continua servindo tudo na mesma porta (`router.Static("/static", "./static")`), sem processo Node
  em produção. Rodar `npm run build` dentro de `server/web/` sempre que mudar o frontend.
- Roteamento client-side com `react-router-dom`; Go serve `static/app/index.html` para `/`, `/login`
  e `/change-password` (ver `internal/app/handler/static_handler.go` — o middleware `ServeStatic`
  serve essa mesma casca para qualquer rota não-API, é o fallback de SPA).
- Tokens de design em `server/web/src/styles/tokens.css`, classes utilitárias reaproveitáveis
  (`.btn`, `.field`, `.select`, `.auth-*`, `.avatar`...) em `server/web/src/styles/global.css` —
  ambos extraídos 1:1 do protótipo via design-graph. Não crie CSS solto por componente; estenda
  esses dois arquivos.
- Testes com **Vitest + Testing Library** (`npm run test` ou `make web-test`) — unitários para
  `api/*.ts` (mock de `fetch`) e de componente para as telas. TDD (red/green/refactor) é o fluxo
  esperado: escreva o teste antes da implementação da próxima tela.
- **Cuidado com slices nil no Go**: `GET /teams` vazio retorna `{"success":true}` **sem a chave
  "teams"** (slice nil não serializa como `[]`), diferente de `GET /applications` (sempre `[]`).
  Verificado contra o servidor real, não assumido pela doc. Trate toda lista opcional no client
  (`body.teams ?? []`) e confirme contra o servidor de verdade antes de assumir `[]` — inconsistente
  endpoint a endpoint.
- **Bug real de tokens corrigido**: `docs/toToggle.html` define `bg`/`surface`/`ink`/`border`/
  `shadow` em DOIS temas — `:root, [data-theme="dark"]` (o default real, sem nenhum data-theme
  setado) e `[data-theme="light"]` (override). `tokens.css` tinha misturado os dois: superfícies do
  tema claro com accent do tema escuro — uma combinação que não existe no protótipo. Corrigido para
  um único tema consistente (escuro, o default real). Não há toggle de tema — não foi pedido.

### Estado da migração (tela por tela)
- ✅ **Login** (`server/web/src/screens/LoginScreen.tsx`) — único caminho real de entrada
  (usuário/senha via `POST /auth/login`); o protótipo só tinha um seletor de perfis demo, então o
  formulário foi montado à mão reaproveitando as classes/tokens reais do protótipo.
- ✅ **AppShell** (`components/AppShell.tsx`) — casca autenticada (sidebar + nav + user menu).
  Guarda de sessão **client-side** via `useCurrentUser`/`GET /profile` (ver nota de segurança
  abaixo) — redireciona pra `/login` sozinho se não autenticado.
- ✅ **Applications** (`/`, `screens/ApplicationsScreen.tsx`) — lista real via `GET /applications` +
  `CreateApplicationModal` (root/admin; `<select>` de time via `listTeamOptions` — root vê todos os
  times com `GET /teams`, outras roles só os próprios com `GET /profile/teams`, já que `POST
  /applications` não valida quem pode usar qual `team_id`). Trata o caso *approval-aware*: se a API
  responde `202 {approval_required:true}` em vez de `201`, mostra aviso de "aguardando aprovação" em
  vez de inserir uma aplicação fantasma na lista. `AppCard` agora é link pra `/applications/:id`.
- ✅ **Troca de senha** — `ChangePasswordForm` (componente puro, validação + UI) reaproveitado por
  duas telas finas: `ForcedPasswordChangeScreen` (`/change-password`, standalone fora do AppShell —
  primeiro acesso não tem sessão real, só o `password_change_token`) e `AccountSecurityScreen`
  (`/account/security`, dentro do AppShell — troca voluntária via menu do usuário). Endpoints
  diferentes (`/auth/change-password-first-time` vs `/profile/change-password`), mesma UI.
- ✅ **Teams & people** (`/teams`, `screens/TeamsScreen.tsx`) — lista via `GET /teams` +
  `CreateTeamModal` (root only; o item de nav some pra quem não é root, já que `/teams` inteiro exige
  `RequireRoot()`). Apagar time (`TeamRow`, botão de lixeira + `ConfirmModal`) usa `DELETE
  /teams/:id` — diferente de apagar toggle/aplicação, **não é approval-aware** (não está na lista de
  `action_type` do workflow, confirmado em docs/rest-flow.md), então a resposta é sempre
  definitiva; a lista é atualizada localmente (filter), sem novo `GET /teams`. `Modal` virou componente genérico (`components/Modal.tsx`), já reaproveitado
  por `CreateApplicationModal`. `TeamMembersSection` (por time) lista/adiciona/remove membros —
  `AddMemberModal` adapta `MemberModal` do protótipo pra API real: o protótipo "convida por nome"
  (cria pessoa nova ali), mas a API só associa um usuário **já existente**
  (`POST /teams/:id/users {user_id}`), então virou um `<select>` sobre `GET /users` (root only).
  Trocar a role de um membro fica fora desta tela de propósito — role é global no usuário
  (`entity.User.Role`), não por time; essa ação vive em `screens/UserManagementScreen.tsx`.
- ✅ **Detalhe de aplicação** (`/applications/:id`, `screens/ApplicationDetailScreen.tsx`) — árvore
  de toggles via `GET .../toggles?hierarchy=true` (`ToggleTree`, recursivo), criação via
  `CreateToggleModal` (path com ponto, ex. `payments.card`), liga/desliga via o endpoint
  **recursivo** `PUT .../toggle/:id` (singular — desliga o nó inteiro e a subárvore de uma vez).
  Inclui `SecretKeySection` (gerar/regerar/apagar a service key; `GeneratedKeyModal` mostra a chave
  em texto plano **uma única vez** — só fecha depois de marcar "copiei e guardei"). **Regra de
  ativação** (`EditToggleDrawer`, botão "Configure" por nó — `ToggleTree` ganhou a prop
  `onConfigure`): liga/desliga status, ativa uma regra dentre os 7 tipos de
  `entity.GetRuleTypeOptions()` (`lib/activationRuleTypes.ts`) e salva via `PUT
  .../toggles/:id` (plural, não-recursivo — diferente do liga/desliga da árvore). Bug real
  encontrado testando ao vivo contra o servidor: `GET/PUT .../toggles/:id` devolve
  `activation_rule: {type:"", value:""}` (objeto truthy, **nunca `null`**) sempre que
  `has_activation_rule` é `false` — ler isso com `activation_rule?.type ?? null` resolvia pra
  `""` (um `ActivationRuleType` inválido) em vez de `null`. Corrigido extraindo a derivação pra
  uma função pura testável isoladamente (`deriveInitialRuleState`, em
  `lib/activationRuleTypes.ts`) que trata `has_activation_rule` como o único sinal confiável —
  nunca confia na forma/truthiness de `activation_rule` sozinho. **Exclusão** (toggle, aplicação):
  botão de lixeira por nó em `ToggleTree` (`onDelete`, desabilitado quando o nó tem filhos — ver
  nuance abaixo) e "Delete application" no cabeçalho (root only), ambos abrindo o novo
  `components/ConfirmModal.tsx` (adaptado de `get_component_spec("ConfirmModal")`, casca genérica
  reutilizável sobre `Modal`). Nuance real da API confirmada ao vivo: `DELETE
  .../toggles/:toggleId` num nó **com filhos** responde `200 OK` normalmente mas **não apaga nada**
  (o handler não tem como sinalizar isso na resposta) — em vez de chamar a API e mentir "apagado"
  pro usuário, o botão fica desabilitado nesse caso, com tooltip explicando. Deletar a folha
  funciona e ainda faz bubble-up: se isso deixa o pai sem filhos, o pai também é removido — testado
  ao vivo (`payments.card` → apagar `card` → `payments` some sozinho também).
- ✅ **Approvals** (`/approvals`, `screens/ApprovalsScreen.tsx`) — **uma única tela com abas**
  (Pending/Approvable, Mine, Settings), não três rotas separadas como em fases anteriores desta
  reescrita. Reconstruída a partir de `get_screen_full("ApprovalsView")`, que revelou a estrutura
  real: um banner de status root-only no topo ("Sistema ativo/desativado · N ações configuradas"
  + botão "Configurar"), uma barra de abas (`.audit-filter`/`.chip`), e o conteúdo trocando entre
  a lista de solicitações e `ApprovalSettingsView` **inline** — "Configurar" só troca de aba,
  nunca navega. A antiga tela separada `ApprovalSettingsScreen.tsx` (rota `/approvals/settings`)
  foi apagada; seu conteúdo virou `components/ApprovalSettingsPanel.tsx`, um componente puro
  (recebe `settings`+callbacks via props, sem fetch próprio) renderizado como a aba "Settings".
  - **Pending/Approvable**: root vê `GET /approval/requests/pending` (tudo); outras roles veem
    `GET /approval/requests/approvable` (só o que podem aprovar, já filtrado no servidor).
    "Approve" no client encadeia `POST .../approve` + `POST .../execute` — a API separa os dois
    de propósito (aprovar não executa sozinho); se `execute` falhar depois de `approve` ter
    funcionado, a linha vira um botão "Retry" isolado. `RejectApprovalModal` para rejeição com
    motivo opcional. Testado ao vivo o ciclo completo: admin sem bypass cria uma aplicação → fica
    `202 pending` → root vê, aprova, executa → aplicação passa a existir de fato.
  - **Mine** (aba nova, `GET /approval/requests/my`): solicitações do próprio usuário. Nunca
    mostra botões de ação (autoaprovação é proibida — `docs/rest-flow.md` §9.2, "CanBeApprovedBy
    forbids self-approval") — `ApprovalRow` ganhou uma prop `isOwn` que mostra "Aguardando
    revisão de um aprovador" (texto literal confirmado no protótipo) em vez de só o chip genérico
    de status.
  - **Settings** (root only): switch mestre liga/desliga o workflow inteiro, lista de 10 flags
    agrupadas (Toggles/Applications/Secret keys, ver `lib/approvalActionTypes.ts`) e campo de
    dias de expiração. Texto do switch mestre e do aviso de sistema desativado é literal do
    protótipo; labels da lista de ações são lidos direto de `getActionType`
    (`internal/app/middleware/approval.go`) porque `APPROVAL_ACTIONS` no protótipo não tem os 10
    valores reais. **UI deliberadamente honesta**: `getActionType` só infere
    `toggle_create`/`toggle_update`/`toggle_delete`/`application_create`/`application_delete` de
    uma rota HTTP de verdade — `toggle_enable`, `toggle_disable`, `toggle_rule`,
    `secret_key_create`, `secret_key_delete` existem no modelo e podem ser ligadas, mas nunca são
    checadas. Em vez de deixar o root achar que ligou uma proteção que não existe, essas 5 flags
    mostram um hint explicando o que realmente as governa. `PUT /api/approval/settings`
    substitui `required_actions` por inteiro quando presente — cada switch individual manda o
    objeto completo com só aquela chave invertida.
  - **Achado incidental**: `.empty` (usado em toda tela vazia do app) tinha um `svg`/`.et`/`.ed`
    confirmados no protótipo (ícone + título + descrição) que nunca foram extraídos — só texto
    solto era usado em todo lugar. Adicionado a `global.css`; aplicado aqui na aba
    Pending/Mine, ainda pendente de aplicar nas outras telas com estado vazio (Applications,
    Teams, etc. — ver auditoria de CSS em andamento).
- ✅ **History** (`/history`, `screens/HistoryScreen.tsx`) — o protótipo descreve "um audit trail de
  toda mudança do sistema", mas o backend **não tem** um log de auditoria genérico — a única trilha
  real é `GET /approval/requests` (qualquer status, qualquer role). Reaproveita `ApprovalRow` num
  modo `readOnly` (chip de status sempre, nunca botão de ação — e ganhou um chip "Pending" que
  faltava, antes qualquer status que não fosse approved/rejected virava "Expired" por engano).
  Ordena por `created_at` desc no client. Com isso, **todo item de nav do AppShell aponta pra uma
  tela real** — nenhum `NotMigratedScreen` sobrou, o componente foi removido (não tinha mais
  nenhuma rota apontando pra ele).
- **Bug real de roteamento encontrado e corrigido (histórico)**: `isAPIRoute` usava
  `strings.HasPrefix(path, "/approval")` pra reconhecer a API de aprovação — mas `/approvals`
  (rota SPA de `screens/ApprovalsScreen.tsx`) também começa com essa string por acidente
  (`"/approvals"` tem `"/approval"` como prefixo literal). Um hard refresh em `/approvals` batia
  em `c.Next()` sem handler nenhum registrado pra esse path exato e devolvia `404 page not found`
  cru em vez da casca do SPA — confirmado ao vivo. Corrigido na hora exigindo um boundary
  explícito só pro prefixo `/approval`, mas isso era um remendo local — ver a correção estrutural
  definitiva abaixo. (Uma fase posterior chegou a usar `/approvals/settings` como rota
  client-side pra uma tela separada de configurações — essa rota não existe mais desde que
  Approvals e Approval Management viraram abas de uma única tela, ver bullet "Approvals" acima.)
- **Achado maior, corrigido numa fase posterior**: a verificação ao vivo da correção acima expôs
  que `/teams` e `/applications/:id` tinham o mesmo problema numa forma sem solução por string —
  o path da tela SPA era **idêntico** ao path da rota de API real (não só um prefixo colidindo).
  Um hard refresh autenticado em `/teams` devolvia `{"success":true}` cru (o JSON de `GET
  /teams`) em vez da casca do SPA. Isso era estrutural ao design de `isAPIRoute` (decidia
  API-vs-SPA só pelo formato da URL) e afetava qualquer tela cujo path client-side reusasse
  literalmente um path de API. **Resolvido de vez** movendo toda a API pra debaixo de `/api` —
  ver "Separação API vs SPA" na seção "API e Rotas" acima pro detalhe completo da mudança
  estrutural (não foi um remendo pontual como o do bullet anterior, e sim uma mudança na forma
  como o middleware inteiro decide servir API vs SPA).
- ✅ **User Management** (`/user-management`, `screens/UserManagementScreen.tsx`, root only) —
  sem tela equivalente no protótipo (só a referência em `MemberRow.tsx` sobre role ser global,
  não por time). Rota client-side é `/user-management`, não `/users`: esse último é o path real
  de API hoje (`GET`/`POST /api/users`) — na época em que essa tela foi construída a API ainda
  era bare `/users` (path idêntico à rota client-side cogitada, sem solução por boundary de
  string), o que já apontava pra necessidade da correção estrutural que veio depois.
  Criar usuário reaproveita o padrão de reveal-once já usado pela secret key
  (`components/GeneratedPasswordModal.tsx`, mesma estrutura de `GeneratedKeyModal.tsx`): a senha
  gerada pelo servidor só existe na resposta de `POST /users` (docs/rest-flow.md §3), nunca mais
  recuperável. Troca de role usa um `<select>` por linha (`UserRow`) — "Root" só aparece como
  opção na própria linha do usuário logado (atribuir root pra outra conta sempre dá `403`).
  Apagar usuário usa `ConfirmModal`; o botão de apagar nem aparece na própria linha (auto-exclusão
  sempre recusada pela API).
- **Bug real de status HTTP encontrado e corrigido**: `POST /users` com username duplicado
  devolvia `500 Internal Server Error` em vez de `409 Conflict` — `UserUseCase.CreateUser`
  retornava um `errors.New()` genérico em vez do `*entity.AppError{Code: ErrCodeAlreadyExists}`
  que `application_usecase.go`/`team_usecase.go` já usam (o handler de aplicações já sabe mapear
  esse código pra 409; o de usuários não tinha esse type-assert). Confirmado ao vivo: criar "bob"
  duas vezes devolvia 500 na segunda tentativa. Corrigido nos dois lados (usecase retorna o
  `AppError` certo; `user_management_handler.go#CreateUser` faz o mesmo type-assert que
  `application_handler.go` já fazia) com TDD (teste de usecase + teste de handler, ambos
  vermelhos antes da correção). Removido também código morto sem nenhum chamador em lugar nenhum
  do repositório: `UserUseCase.CreateUserDeprecated`, `GetAllUsersPtr`, `UpdateUserDeprecated`.
- ✅ **Designação de aprovadores por time** (`POST /teams/:id/approvers/:user_id`) — integrada
  direto em `components/MemberRow.tsx`/`TeamMembersSection.tsx`, adaptado de
  `get_component_spec("MemberRow")` (JSX confirmado com o switch de aprovador de verdade, incluindo
  o texto literal "Aprovador"/"Designar como aprovador"/"Remover como aprovador"). **Troca de role
  do protótipo (role-pill) foi deliberadamente deixada de fora**: já existe uma tela dedicada pra
  isso (`UserManagementScreen`), e role é global no usuário — duplicar a mesma ação aqui criaria
  duas fontes de verdade pro mesmo estado. O switch só aparece pra membros com role `admin` (a API
  também aceita `root`, mas o controle é escondido pra qualquer membro root, mesmo padrão de
  esconder auto-gerenciamento usado em `UserRow`/`ApplicationDetailScreen`). Fonte de dados virou
  `GET /teams/:id/approvers` (`api/teams.ts#listTeamApprovers`) em vez de `GET /teams/:id/users` —
  o antigo `listTeamMembers` virou código morto (zero chamadores) e foi apagado.
- **Bug real de backend encontrado e corrigido**: `docs/rest-flow.md` §9.3 documenta que `GET
  /teams/:id/approvers` devolve **todo membro do time, não só os aprovadores atuais** — mas a
  query SQL em `team_approver_repository.go#GetTeamApprovers` tinha um `AND tu.is_approver = true`
  que filtrava só quem já era aprovador. Confirmado ao vivo: um time com um admin aprovador e um
  user comum devolvia só o admin — o membro comum sumia da lista inteira (não só do controle de
  aprovador, do time inteiro, já que essa é a fonte de dados de `TeamMembersSection` agora).
  Corrigido removendo o filtro da query; `GetTeamApprovers` (usecase e repo) passou a servir tanto
  `GET /teams/:id/approvers` quanto a resposta "refreshed" de `POST .../approvers/:id`
  consistentemente com o roster completo. Ajustados os testes existentes do repositório que
  codificavam o comportamento antigo (bugado) como esperado — `TestTeamApproverRepository_
  GetTeamApprovers`/`_Integration` agora afirmam explicitamente que membros não-aprovadores
  continuam na lista, só com `is_approver: false`.
- Nota de segurança pré-existente (não introduzida por essa reescrita, apenas contornada no
  client): o middleware `ServeStatic` serve a casca do SPA em `/` sem checar sessão antes do
  `ValidateToken()` da rota rodar — a proteção real está nas chamadas de API. `useCurrentUser`
  (`GET /profile`) é quem faz esse gate de verdade hoje.

## Principais Funcionalidades

### 1. Gerenciamento Hierárquico de Toggles
- Estrutura em árvore com caminhos como `feature.new.dashboard`
- Herança de estado (toggle pai desabilitado desabilita filhos)
- Visualização hierárquica e flat
- Operações recursivas

### 2. Sistema de Times e Permissões
- Organização de usuários em times
- Permissões granulares por aplicação
- Controle de acesso baseado em roles

### 3. Regras Avançadas de Ativação
- Múltiplos tipos de regras
- Rollouts percentuais
- Targeting por usuário, IP, país
- Releases canário

### 4. API Pública
- Acesso via secret keys
- Integração externa sem autenticação
- Retorno completo de aplicação + toggles

### 5. Interface Moderna
- Design responsivo
- Transições suaves
- Feedback visual em tempo real
- Experiência de usuário otimizada

## Padrões de Código e Boas Práticas

### Convenções Go
- Seguir padrões idiomáticos do Go
- Interfaces pequenas e focadas
- Error handling explícito
- Uso de context quando apropriado

### Arquitetura
- Separação clara de responsabilidades
- Inversão de dependências
- Testabilidade em todas as camadas
- Domain-driven design

### Segurança
- Senhas hasheadas com bcrypt
- Cookies HTTP-only
- Validação de entrada rigorosa
- Princípio do menor privilégio

## Scripts e Automação

### Docker
```yaml
# docker-compose.yml
services:
  totoogle:
    build: .
    ports:
      - "3056:3056"
    volumes:
      - ./db:/root/db
```

### Dockerfile
- Multi-stage build
- Imagem mínima de produção
- Cópia otimizada de assets

## Monitoramento e Logs

### Logging
- **Estruturado**: Logs JSON estruturados
- **Níveis**: Debug, Info, Warn, Error
- **Contexto**: Incluir informações relevantes

### Métricas (Potencial)
- Número de toggles por aplicação
- Frequência de mudanças
- Tempo de resposta das APIs
- Uso por usuário/time

## Considerações de Performance

### Banco de Dados
- Índices em campos frequentemente consultados
- Queries otimizadas com GORM
- Lazy loading de relacionamentos

### Frontend
- Assets minificados
- Carregamento otimizado
- Cache de recursos estáticos

### Backend
- Connection pooling
- Middleware eficiente
- Resposta JSON otimizada

## Próximos Passos e Melhorias

### Funcionalidades Futuras
- Auditoria completa de mudanças
- Métricas de uso em tempo real
- Integração com CI/CD
- Webhooks para notificações
- Cache distribuído (Redis)

### Melhorias Técnicas
- Observabilidade com OpenTelemetry
- Health checks robustos
- Rate limiting por usuário
- Backup automático do banco

Esta documentação serve como base para entender a arquitetura, estrutura e funcionalidades da aplicação ToToogle, permitindo desenvolvimento e manutenção eficientes.