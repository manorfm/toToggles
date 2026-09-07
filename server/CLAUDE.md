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
1. Login via POST `/api/auth/login` com username/password (rate-limitado por IP, ver abaixo)
2. Validação de credenciais com bcrypt + checagem de `entity.User.Active`
3. Emissão de uma sessão real (token opaco de 256 bits, ver abaixo) num cookie HTTP-only
4. `ValidateToken()` (middleware) valida a sessão em toda rota protegida

**Bypass de autenticação real encontrado e corrigido numa auditoria de produção.** O mecanismo de
sessão inteiro era falso: `LocalAuthStrategy.generateJWT()` (nome do método era enganoso — nunca
gerava JWT nenhum) devolvia literalmente `"token_" + user.ID`, e `AuthUseCase.ValidateToken()` só
tirava esse prefixo e buscava o usuário por ID — **sem verificar assinatura, expiração ou
qualquer segredo**. Qualquer pessoa que soubesse o ID (ULID) de um usuário — inclusive root —
conseguia montar um cookie `auth_token` válido pra essa conta, sem senha nenhuma; IDs aparecem em
várias respostas de API já autenticadas (listas de time, `created_by`/`approved_by` em
aprovações). O fluxo de troca de senha obrigatória tinha o mesmo problema:
`GeneratePasswordChangeToken` gerava `"temp_password_change_" + userID + "_" + username`, forjável
por qualquer um que soubesse essas duas informações — igualmente públicas. Os testes existentes
(`local_strategy_test.go`, `auth_usecase_test.go`) afirmavam esses formatos como comportamento
**esperado**, então o bug nunca foi pego por eles.

Corrigido substituindo por um esquema de sessão opaca server-side — reaproveitando 1:1 o padrão já
usado por `entity.SecretKey` (32 bytes de `crypto/rand`, só o hash SHA-256 vai pro banco, nunca o
valor bruto) em vez de introduzir JWT: este é um monólito único com SQLite, toda validação já
batia (e continua batendo) no banco, então JWT só traria a complexidade de gerenciar uma chave de
assinatura sem nenhum ganho real de "stateless".

- **`entity.Session`** (`internal/app/domain/entity/session.go`) — `TokenHash` (SHA-256,
  `uniqueIndex`), `UserID`, `Purpose` (`"auth"` ou `"password_change"` — os dois tipos de token
  antigos viraram uma única tabela/mecanismo, só divergindo em TTL e em `password_change` ser de
  uso único), `ExpiresAt`. `NewSession(userID, purpose, ttl)` gera o token bruto e devolve
  `(*Session, rawToken, error)` — o valor bruto nunca é persistido.
- **Migração**: `db/migrations/20260827000000_add_sessions_table.sql` (goose — ver "Sistema de
  Migrações" abaixo; não é AutoMigrate).
- **`AuthUseCase`** (`internal/app/usecase/auth_usecase.go`) ganhou `sessionRepo
  repository.SessionRepository`. `Login` autentica e, se `Success` e `!MustChangePassword`, emite
  uma sessão `Purpose: auth` (TTL 7 dias, `AuthSessionTTL`, casando com o `Max-Age` do cookie).
  `ValidateToken` faz hash do token recebido, busca por hash, confere expiração, `Purpose ==
  auth`, **e que a conta ainda está ativa** (uma sessão de um usuário desativado depois de emitida
  deixa de validar). `Logout(token)` apaga a sessão de verdade (antes, só o cookie era limpo — a
  sessão "válida" continuava existindo até expirar sozinha). `GeneratePasswordChangeToken`/
  `ValidatePasswordChangeToken` usam `Purpose: password_change` (TTL 1h) e são de uso único
  (`Validate...` apaga a sessão após consumida).
- **Defesa em profundidade — trocar/resetar senha invalida sessões existentes**:
  `ChangePasswordFirstTime` e `UserUseCase.ChangePassword` (troca voluntária) chamam
  `sessionRepo.DeleteByUserID` depois de trocar a senha — se um token vazou, trocar a senha mata
  ele também (efeito colateral esperado: força novo login, inclusive da própria sessão que fez a
  chamada). `UserManagementHandler.ResetUserPassword` (reset feito por admin/root) chama o mesmo
  via `UserUseCase.InvalidateSessions` — reset de senha é a resposta padrão a uma conta
  possivelmente comprometida, faz sentido matar a sessão junto.
- **`entity.User.Active` nunca era checado** (achado na mesma auditoria) — a feature "desativar
  usuário" (`SetUserStatus`) era cosmética: a conta continuava logando e sessões existentes
  continuavam válidas. Corrigido em dois pontos: `LocalAuthStrategy.Authenticate` recusa login
  (mensagem genérica "Invalid username or password", pra não revelar que a conta existe mas está
  desativada) e `AuthUseCase.ValidateToken` recusa uma sessão pré-existente se a conta foi
  desativada depois.

### Middleware de Segurança
- **Localização**: `internal/app/middleware/security.go`, `internal/app/middleware/login_rate_limiter.go`
- **`SecurityHeaders()`**: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy, `Cache-Control: no-store` em toda `/api/*`.
- **CORS removido por completo numa auditoria posterior — não existe mais `CORSHeaders()`,
  `config.AllowedOrigins()`, nem a env var `CORS_ALLOWED_ORIGINS`.** Corrigido pra allowlist numa
  auditoria anterior (antes ecoava de volta **qualquer** `Origin` recebido com
  `Access-Control-Allow-Credentials: true`), mas uma investigação posterior (pedida pelo usuário:
  "o cors precisa mesmo?") achou que a allowlist só protegia uma coisa real: um fallback
  `Authorization: Bearer <token>` em `ValidateToken()` ("for API compatibility") — o cookie de
  sessão (`SameSite=Strict`) já é bloqueado cross-site pelo próprio navegador, independente de
  CORS, e a API pública de secret key nunca foi afetada por CORS (mecanismo só de navegador;
  chamadores server-to-server, que é o que toda client library é, não são sujeitos a ele).
  Confirmado por grep no monorepo inteiro que esse fallback não tinha chamador real (frontend usa
  `credentials: "include"`, nunca um header Authorization) nem cobertura de teste — removido como
  código morto (`TestValidateToken_OnlyAcceptsCookie_NotAuthorizationHeaderFallback`, TDD,
  vermelho confirmado antes da remoção provando que o fallback de fato autenticava). Com o
  fallback fora, CORS não protegia mais nada real — removido junto (`CORSHeaders()`,
  `isAllowedOrigin()`, `config.AllowedOrigins()`, a env var, os testes que cobriam esse
  comportamento). Decisão viável porque este serviço é interno, sem exposição à internet
  (confirmado pelo usuário) — um serviço que precisasse suportar um frontend legítimo hospedado
  numa origem diferente precisaria reintroduzir isso.
- **Cookies `Secure` configuráveis** (`config.CookieSecure()`, env var `COOKIE_SECURE`, default
  `true`) — antes `false` hardcoded em toda chamada `SetCookie` (5 lugares), com o próprio
  comentário admitindo "set to true in production". Nunca era.
- **`LoginRateLimit()`** (novo) — limita `POST /api/auth/login` a 10 tentativas por IP a cada 15
  minutos (`429` ao estourar), resetado em login bem-sucedido. Em memória, sem dependência nova
  (mapa + mutex, janela deslizante) — processo único, sem necessidade de um limitador distribuído.
  Só faz sentido como defesa depois da correção acima: antes, login nem era um alvo de força bruta
  que importasse (o "token" verdadeiro nunca dependia da senha real de qualquer jeito).

### Configuração de ambiente (nova — antes tudo hardcoded)
`internal/app/config/env.go`: `SERVER_PORT` (default `3056` — antes hardcoded em
`router.go`, enquanto `server/Dockerfile`/`docker-compose.yml` expunham `8081`, um mismatch que
tornava o deploy via Docker inalcançável na porta mapeada; corrigido nos dois lados),
`DB_PATH` (default `./db/toggles.db` — antes hardcoded em `db.go`, apesar do README já documentar
essa env var como se existisse), `COOKIE_SECURE` (acima; `CORS_ALLOWED_ORIGINS` existiu aqui mas
foi removida — ver "Middleware de Segurança" acima), `TLS_CERT_FILE`/`TLS_KEY_FILE` (ver "TLS"
abaixo).

### Senha inicial do root — arquivo, não stdout
`AuthUseCase.InitializeRootUser()` (`internal/app/usecase/auth_usecase.go`) parava de imprimir a
senha gerada com 5 `println(...)` — um log de container facilmente acaba num agregador
(CloudWatch/Datadog/etc.), então isso era quase publicar a senha do root. Agora escreve num
arquivo (`<diretório de DB_PATH>/initial-root-password.txt`, permissão `0600`, injetado via um
novo parâmetro `rootPasswordFilePath` em `NewAuthUseCase` — calculado em `handler/init.go` a
partir de `config.DBPath()`, não lido direto de `config` dentro do usecase, pra manter a camada
de usecase sem dependência de infra). Mesma ideia do Jenkins (senha inicial num arquivo dentro do
volume persistente, lida uma vez via `docker exec ... cat ...`), mas fecha a fresta que o próprio
Jenkins deixa aberta (ele também ecoa no console): aqui é só arquivo, nunca stdout. O arquivo tem
vida curta e determinística — `ChangePasswordFirstTime` o apaga (best-effort, `os.IsNotExist` não
é erro) assim que a troca de senha obrigatória do root é concluída, não "até alguém lembrar de
apagar". Documentado no README raiz e em `totoggle_java/README.md` (seção "First boot").

### Log estruturado (JSON)
`internal/app/config/logger.go` reescrito por dentro com `log/slog` (stdlib desde Go 1.21, sem
dependência nova) — mantém a mesma API pública (`Debug/Info/Warn/Error` + variantes `f`) que os
~6 call sites já usavam, então nenhum precisou mudar. O `prefix` de `NewLogger(prefix)`, que antes
virava um prefixo de texto solto (`"DEBUG: ..."`), agora é o campo estruturado `"component"` em
cada linha JSON — o que uma ferramenta de agregação de log consegue de fato indexar/filtrar.
`newLoggerWithWriter(prefix, io.Writer)` (não exportado) existe só pra permitir capturar e
inspecionar o JSON gerado em teste, já que `NewLogger` sempre escreve em `os.Stdout` em produção.

### TLS
`internal/app/router/router.go#Initialize` — `TLS_CERT_FILE`+`TLS_KEY_FILE` ligam
`router.RunTLS(...)` em vez de `router.Run(...)` (HTTP puro, comportamento de sempre — continua
válido pra quem já roda atrás de um proxy reverso que termina TLS). `config.HasTLSConfig()`
distingue 3 casos: nenhum dos dois setado (HTTP puro, intencional), os dois setados (liga TLS), e
**só um dos dois setado** — tratado como erro de configuração que falha alto no boot (log
`ERROR`, servidor não sobe), em vez de cair silenciosamente pra HTTP quando a intenção real era
HTTPS.

### Empacotamento Docker e schema do banco — corrigidos numa auditoria de produção posterior
Uma auditoria de "está pronto pra produção?" encontrou e corrigiu, todos verificados ao vivo
contra a imagem real buildada (`docker build --target production` + `docker run`, não só lidos no
código):

- **Cross-compile arm64**: o `builder` stage tinha `GOARCH=amd64` hardcoded com cgo a partir de
  `golang:1.23-alpine` — falhava em host arm64 (`gcc: unrecognized command-line option '-m64'`).
  Corrigido com `ARG TARGETOS`/`ARG TARGETARCH` **sem valor default** (`Dockerfile`) — BuildKit
  preenche esses dois automaticamente com a plataforma real de build/target (inclusive em
  `docker build` comum, sem `--platform`/buildx explícito), então isso vira compilação NATIVA
  (gcc local válido pro CGO), não cross-compile de verdade. Achado ao vivo: dar um valor default
  explícito ao `ARG` (`=amd64`) faz o BuildKit usar esse literal em vez do valor real detectado —
  reproduziu o bug de novo até o default ser removido.
- **Binário `file` ausente**: `RUN ls -la totoogle && file totoogle` falhava porque a imagem
  alpine do builder não tinha esse pacote. Corrigido adicionando `file` ao `apk add` já existente.
- **`/db` sem permissão de escrita**: a `production` stage roda como `USER 65534:65534` (nobody)
  mas o `COPY --from=assets /assets/db/migrations /db/migrations` (sem `--chown`) deixava `/db`
  dono de root — o binário falhava criando `./db/toggles.db` (`permission denied`) no primeiro
  boot com config default. Corrigido com `COPY --chown=65534:65534` (aplica tanto aos arquivos
  quanto ao diretório `/db` criado pela própria cópia). **Ressalva que o Dockerfile sozinho não
  resolve**: um volume bind-mounted (caso do `docker-compose.yml`, `./db:/root/db`) herda o dono
  do diretório do HOST, não o `--chown` da imagem — documentado em `docker-compose.yml` como
  `chown 65534:65534 ./db` no host antes do primeiro `docker compose up`.
- **Achado bem mais sério durante a validação ao vivo da correção acima**: mesmo com o `/db`
  gravável, o primeiro login falhava com `no such table: users` — a imagem `production` (FROM
  `scratch`) nunca tinha como aplicar o schema. Migrations só existiam como CLI externa (`goose`
  via `make migrate-up`), e nem o CLI nem qualquer runner programático existiam dentro da imagem
  scratch (sem shell, sem goose). O binário (`config/db.go`) só criava um arquivo SQLite VAZIO —
  zero tabelas. Corrigido embutindo as migrations no próprio binário:
  `db/migrations/embed.go` (novo pacote `migrations`, `//go:embed *.sql`) +
  `github.com/pressly/goose/v3` como dependência real (pinado em `v3.20.0` deliberadamente — a
  `@latest` bumpava `go.mod` de `go 1.23.0` pra `go 1.25.7`, o que quebraria o `builder` stage
  fixado em `golang:1.23-alpine`; confirmado que builds normais quebram nessa combinação antes de
  fixar a versão). `config.InitializeDB()` chama `goose.Up(sqlDB, ".")` contra o `embed.FS` a cada
  boot — idempotente (só aplica o que falta). O Makefile não tem (nem nunca precisou ter, depois
  desta correção) um target manual de migração — `make run`/`make dev` já bastam sempre. O
  `Dockerfile` builder stage precisou
  ganhar `COPY db/migrations/ ./db/migrations/` (antes só existia pro stage `assets`, que nunca
  compila nada — o `go:embed` precisa do diretório presente no stage que roda `go build`).
  Verificado ao vivo, fim a fim: build → run com volume real → schema criado (10 migrations
  aplicadas) → `initial-root-password.txt` gerado e legível → login com essa senha real devolve
  `200`/`must_change_password: true`. Também achado e corrigido no mesmo fio de investigação:
  `verifyDbFile` (`config/db.go`) tinha `os.MkdirAll("./db", ...)` hardcoded, ignorando o
  `DB_PATH` real configurado — inofensivo no default (`./db/toggles.db`, onde "./db" já é a pasta
  certa), mas quebrava silenciosamente o caso do `docker-compose.yml`
  (`DB_PATH=/root/db/toggles.db`, uma pasta diferente). Corrigido pra `filepath.Dir(dbPath)`.

## API e Rotas

> ⚠️ **Toda a API vive sob `/api`** (ver "Separação API vs SPA" no final desta seção — mudança
> estrutural feita para resolver de vez a colisão entre rotas SPA e rotas de API que tinham o
> mesmo path). As listas abaixo já refletem os paths atuais.

### Rotas de Autenticação (Públicas)
- `POST /api/auth/login` - Login do usuário
- `POST /api/auth/logout` - Logout do usuário
- `POST /api/auth/change-password` - Alteração de senha

### Rotas de Usuários (criar/listar: root ou admin, admin escopado aos próprios times via
### `canManageUser`; as demais: root only)
- `POST /api/users` - Criar usuário (root: qualquer time; admin: só os seus)
- `GET /api/users` - Listar usuários (admin só vê quem compartilha time consigo + si mesmo)
- `GET /api/users/:id` - Buscar usuário (root only)
- `PUT /api/users/:id` - Atualizar usuário (root only)
- `DELETE /api/users/:id` - Remover usuário (root only)
- `POST /api/users/:id/reset-password` - Gerar nova senha provisória (root ou admin, escopado por `canManageUser`)
- `PUT /api/users/:id/status` - Ativar/desativar (root ou admin, escopado por `canManageUser`)

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
- `POST /api/toggles/disable` - **Kill switch**, mesma secret key acima. Escopo mínimo de
  propósito: só desliga um toggle por `path` (nunca liga, nunca mexe em regra de ativação), pra
  uso por sistemas externos de alerta/monitoramento. Reusa `ToggleUseCase.UpdateToggle(path,
  false, appID)` (`usecase/toggle_usecase.go` — já existia, sem rota chamando antes), escopado por
  `app_id` da própria chave (`ToggleRepository.GetByPath`), então uma chave nunca desliga um
  toggle de outra aplicação mesmo sabendo o path exato — confirmado ao vivo (duas apps com toggle
  de mesmo path, a chave de uma nunca afeta a outra). Idempotente, rate-limitado por chave (30/5
  min, `middleware/killswitch_rate_limiter.go`, mesmo tipo genérico de janela deslizante do login
  agora extraído em `middleware/rate_limiter.go`). Registrada no mesmo nível de `GET
  /api/toggles` (fora de `protected`/approval) — bypass deliberado do approval workflow, ver
  `docs/rest-flow.md` §8.1. Reusa a MESMA secret key da leitura (trade-off aceito, não uma
  credencial nova — ver a mesma seção da doc pro raciocínio completo).

### Rotas de Auditoria (Protegidas)
- `GET /api/audit?category=...&cursor=...&limit=...` — audit trail real, adicionado numa fase
  posterior desta reescrita depois de uma auditoria (pedida pelo usuário) contra o `HistoryView`
  real do protótipo, que revelou que a tela "History" existente só reaproveitava o histórico de
  aprovações (`GET /approval/requests`), não um audit trail genérico — porque **não existia
  nenhum** no backend até então. Discutido o plano com o usuário antes de implementar (opções:
  faseado por tipo de evento / completo / não construir — escolhido faseado; depois retomado com
  "sim" pra implementar de fato) e refinado com dois requisitos explícitos do usuário: paginação
  **infinita por cursor, não por número de página**, e os mesmos filtros de categoria do
  protótipo (chips `All/Toggles/Keys/Access/Approvals`).
  - **Entidade nova**: `entity.AuditLog` (`domain/entity/audit_log.go`, migration
    `20260830000000_add_audit_logs_table.sql`) — `event_type` (granular, um por domínio:
    `toggle_created`, `toggle_deleted`, `key_generated`... — ver a constante completa no
    arquivo) mapeado pra exatamente uma de 4 `category` (`AuditEventType.EventCategory()`).
    Diferente do protótipo real: lá um `type` genérico (`"create"`/`"delete"`) é reusado entre
    domínios — o que faz um evento de **apagar usuário** cair na categoria "toggles" no
    protótipo (`AUDIT_CAT["delete"] === "toggles"`), uma ambiguidade real não replicada aqui.
    `text` carrega o marcador literal `<b>...</b>` em volta do termo-chave (ex.: `"Disabled
    <b>experiments</b> branch"`) — confirmado no protótipo real (`app.jsx#logAudit` e o
    `AUDIT_SEED` literal em `data.jsx`), revisitado depois que o usuário apontou (com um
    screenshot do protótipo real) que o negrito estava faltando na reconstrução. **Nunca é
    renderizado via `dangerouslySetInnerHTML`** como o protótipo faz — isso seria abrir XSS
    armazenado de verdade, já que `text` pode embutir um `target`/nome escolhido pelo usuário
    (path de toggle, nome de time/aplicação/usuário). Em vez disso,
    `server/web/src/lib/auditEvents.tsx#renderAuditText` reconhece SÓ o marcador literal
    `<b>...</b>` e monta um elemento React de verdade a partir dele — qualquer outro caractere
    (inclusive `<`/`>`/`&` de um nome malicioso) vira texto puro, nunca é interpretado como
    markup; pior caso de abuso é puramente cosmético (um nome com `<b>` literal fica em
    negrito), nunca execução de código. Ver os testes de segurança em `auditEvents.test.tsx`.
  - **Visibilidade**: `domain/policy.AuditAccess` — mesma regra já validada em `ApprovalAccess`
    (root irrestrito; não-root só vê `team_id` de times dos quais é membro), com nome/dono
    próprios porque auditoria e aprovação são domínios diferentes mesmo reaproveitando a mesma
    pergunta. Eventos sem `team_id` (hoje só `approval_system_toggled`, o on/off do sistema de
    aprovação) ficam root-only "de graça" — `NULL IN (...)` nunca é verdadeiro em SQL, nenhum
    não-root bate nessa cláusula. Gestão de usuário usa a MESMA regra de `team_id`, uma
    aproximação deliberada de `canManageUser` (que é "compartilha QUALQUER time", não "o
    primeiro time gravado no evento") — registrado como simplificação consciente, não como bug.
  - **Onde grava**: no ponto exato da mutação, não em middleware — um middleware amarrado à
    requisição HTTP original nunca veria a execução de uma ação aprovada, que roda numa
    requisição separada bem depois (`POST /approval/requests/:id/execute`). Duas categorias de
    ponto de gravação: (1) direto no **handler**, logo após a chamada ao usecase ter sucesso,
    pra toda mutação imediata (workflow de aprovação desligado, ou aquele tipo de ação não
    configurado pra exigir aprovação) — `ToggleHandler`, `SecretKeyHandler`,
    `ApplicationHandler`, `TeamHandler`, `UserManagementHandler` ganharam um
    `*usecase.AuditUseCase`; se o middleware `RequireApprovalAware` interceptar a ação, o
    handler real nunca roda, então esse caminho nunca dispara por engano quando a ação foi pro
    workflow em vez de executar direto. (2) dentro do próprio **`ApprovalUseCase`**
    (`ApproveRequest`/`RejectRequest`/`UpdateApprovalSettings`, só quando `ApprovalEnabled`
    muda) — `auditUseCase` é um campo opcional ali (pode ficar `nil`; testes de
    autorização existentes passam `nil` de propósito, mesma tolerância já usada pros outros
    parâmetros desse construtor), com um `recordAudit()` interno que checa nil antes de chamar.
  - **Gap fechado numa fase posterior — achado ao vivo pelo usuário, não só teórico**: o
    History real (com dados de uso reais) mostrava TUDO como "root", mesmo ações que
    manoel.medeiros claramente tinha feito (criar toggle, editar aplicação, configurar regra) e
    root só tinha aprovado. Causa raiz: exatamente o gap documentado aqui antes — só
    `ApproveRequest` gravava (`approval_approved`, actor = quem aprovou), o pedido original E a
    execução de verdade não geravam entrada nenhuma. Duas pontas fechadas:
    1. `CreateApprovalRequest` agora grava `approval_requested` ("Requested: {description}") com
       o SOLICITANTE como actor — confirmado no protótipo real como o type "approval-request"
       (`requestApproval`, ícone clock, dot off), que já estava mapeado em `lib/auditEvents.ts`
       mas nunca tinha um evento correspondente sendo gravado de fato no backend.
    2. `ExecuteApprovedAction` foi reestruturado (o `switch` de dispatch agora captura o erro em
       vez de `return` direto em cada `case`) pra gravar o evento de domínio depois que a
       execução de verdade roda — `auditEventForApprovalExecution()` mapeia `ActionType` pro
       `AuditEventType` certo e reaproveita `request.Description` (já um texto legível, montado
       na criação do pedido) + sufixo " (after approval)", igual ao protótipo real
       (`executePendingAction` sempre grava com esse mesmo sufixo). Actor é `caller` (quem
       chamou `.../execute` agora — normalmente o aprovador), nunca o solicitante original —
       mesma escolha do protótipo (`logAudit` sempre usa `currentUser`, nunca quem pediu).
       `AuditEventApplicationUpdated` (tipo novo, sem equivalente real — editar app no protótipo
       não loga nada) precisou existir pra distinguir a edição via approval da criação, já que
       as duas reusam o mesmo `ApprovalActionApplicationCreate` (docs/rest-flow.md §9.1).
    Teste de integração novo (`TestAuditIntegration_ApprovalFlow_RecordsRequesterAndExecutionEvents`)
    prova o fluxo inteiro: pedido → aprovação → execução, as 3 entradas certas com os actors
    certos.
  - **Kill switch (`POST /api/toggles/disable`) deliberadamente fora de cobertura**: autentica
    por secret key, não por sessão — não existe `entity.User` ali pra ser o `actor` (`Record`
    ignora `actor` nil). Cobrir isso exigiria inventar um ator sintético "a secret key", fora do
    escopo combinado (auditoria de ações de usuário logado).
  - **Paginação por cursor** (`repository.AuditLogCursor{CreatedAt, ID}`, codificado opaco em
    base64 pelo handler) — nunca `page`/`offset`, pedido explícito do usuário. O handler pede
    `limit+1` linhas pra saber se existe próxima página sem adivinhar pelo tamanho da página
    devolvida (que empataria exatamente no fim real dos dados também).
  - **Frontend consumindo o endpoint numa fase seguinte** — ver bullet "History" mais abaixo,
    substitui o texto antigo desta seção ("Ainda não feito").

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
- **Localização**: `db/migrations/` (embutidas no binário via `go:embed`, aplicadas
  automaticamente a cada boot — `config.InitializeDB()`, ver detalhes mais abaixo). Não existe
  comando manual de migração no Makefile — nunca é necessário rodar nada à parte.

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
make dev           # Alias de `run`
make run           # Executar aplicação (aplica as próprias migrations automaticamente)
make build         # Compilar binário
make test          # Executar testes
make clean         # Limpar binário e banco
make docker-build  # Build Docker
make docker-run    # Executar container
```

### Comandos de Teste
```bash
go test ./...                           # Todos os testes
go test ./internal/app/domain/entity    # Testes de entidades
go test -coverprofile=coverage.out ./...  # Com coverage
```

### CI
Não existia pipeline nenhum antes — `.github/workflows/` (raiz do monorepo, fora de `server/`)
ganhou 3 workflows independentes, cada um só disparando quando arquivos do seu diretório mudam
(`paths:`): `server-go.yml` (`go build ./... && go test ./... -cover`),
`totoggle-java.yml` (`./gradlew build`, Temurin 21 — o Wrapper 8.7 do projeto não sobe em JDKs
mais novos, ver memória `env-gradle-needs-jdk21`), `frontend-web.yml` (`npm ci && npm test && npm
run build` em `server/web`). Badges nos dois READMEs (raiz e `totoggle_java/README.md`)
substituíram um badge estático fictício ("build: passing" hardcoded, nunca ligado a CI nenhum).

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
  - `db.go` - Setup do banco de dados (caminho via `env.go#DBPath()`)
  - `logger.go` - Configuração de logs
  - `env.go` - Env vars com fallback pro comportamento anterior hardcoded: `SERVER_PORT`,
    `DB_PATH`, `COOKIE_SECURE` (detalhes na seção "Sistema de Autenticação e Autorização")

## Frontend

> ⚠️ **Em reescrita completa.** O frontend antigo (HTML/CSS/JS monolítico vanilla, sem framework)
> foi **removido por completo** — não existe mais em `static/`. Está sendo reconstruído do zero em
> `server/web/` (React + Vite + TypeScript) a partir do design system reformulado. Antes de tocar em
> qualquer tela, veja o harness em `../CLAUDE.md` e siga a skill `design-graph-ui-context`
> (consultar o MCP `design-graph` como fonte de verdade do novo design — nunca reaproveitar padrões
> do frontend antigo, que não existe mais nem deveria servir de referência).

> ⚠️ **Toda busca de informação sobre o protótipo passa pelo MCP `design-graph`** — nunca leia ou
> decodifique `docs/toToggle*.html` diretamente (nem o HTML bruto, nem o bundle `__bundler/manifest`
> comprimido embutido nele). Isso vale mesmo à luz do histórico abaixo, que documenta um buraco de
> cobertura real encontrado no passado (a árvore JSX autenticada do componente `App` não era
> indexada) e a decodificação manual do bundle como workaround usado então — esse workaround está
> **descontinuado por instrução direta do usuário**: ao topar com uma lacuna do design-graph,
> primeiro tente `get_full_jsx(name)` (extração sem corte, cobre a maioria dos casos de
> truncamento) e outras tools (`get_screen_full`/`get_component_full`/`search`) antes de concluir
> que há mesmo uma lacuna; se ainda faltar informação, pergunte ao usuário em vez de decodificar o
> HTML manualmente. O histórico abaixo (achados, arquivos-fonte do bundle antigo, técnica de
> decode) fica só como registro do que já foi investigado — não é mais o método a seguir.
>
> <details>
> <summary>Histórico: o buraco de cobertura do design-graph e o workaround descontinuado (decode manual do bundle)</summary>
>
> **design-graph tinha um buraco grande e conhecido: a árvore JSX autenticada do componente
> `App` nunca era indexada.** `get_full_jsx`/`get_component_spec`/`get_screen_full` para `App`
> sempre devolviam só o branch de login (`<LoginScreen onLogin={login} />`) — o `return` real,
> depois de `if (!authed) return <LoginScreen .../>`, nunca era capturado. Isso já causou várias
> reconstruções erradas nesta reescrita (sidebar sem ícone/contador, topbar inexistente, perfil
> sem avatar/role, e — mais grave — a lógica de status verde/âmbar/vermelho de
> `lib/toggleLeaves.ts` estava semanticamente errada até ser corrigida). O workaround usado então
> (agora descontinuado, ver aviso acima) decodificava o bundle comprimido embutido em
> `docs/toToggle.html`:
> ```python
> import re, json, base64, gzip
> html = open('docs/toToggle.html', encoding='utf-8').read()
> manifest = json.loads(re.search(r'<script type="__bundler/manifest">(.*?)</script>', html, re.S).group(1))
> for uuid, entry in manifest.items():
>     raw = base64.b64decode(entry['data'])
>     if entry.get('compressed'): raw = gzip.decompress(raw)
>     open(f'/tmp/toToggle-proto/{uuid}.{"js" if "javascript" in entry["mime"] else "txt"}', 'w').write(raw.decode('utf-8', 'replace'))
> ```
> Isso produzia ~21 arquivos; a maioria (`react.js`/`react-dom.js`/Babel standalone) era vendor,
> ruído — os arquivos-fonte de verdade eram: `app.jsx` (App inteiro — sidebar/topbar/roteamento/
> estado/todo handler), `views.jsx` (AppList/AppCard/EditDrawer/KeysView/TeamsView/MemberRow/
> Approvals*/HistoryView), `paths.jsx` (StatusRing/ToggleCard/TogglePaths), `modals.jsx` (Modal/
> ConfirmModal/ServiceKeyModal/AppModal/NewToggleModal/MemberModal/TeamModal/
> ApprovalInterceptModal/RejectModal), `auth.jsx` (LoginScreen/ChangePasswordModal/UserMenu/
> RoleBadge), `onboarding.jsx` (OnboardingModal, 7 passos), `icons.jsx` (todo o set real de paths
> SVG — `ICONS`), `data.js` (mock data + `leafPaths`/`pathStatus`/`countTree`/`findNode`/
> `addPath`, as funções que `lib/toggleLeaves.ts` porta 1:1). Regras de CSS específicas também
> saíam via grep direto no HTML bruto (`.classe {` — o arquivo não é minificado nos seletores
> CSS, só o JS fica comprimido no manifest), técnica usada pra extrair `.app`/`.page`/`.topbar`/
> `.count`/`.user-chip` etc.
> </details>

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
- ✅ **AppShell** (`components/AppShell.tsx`) — casca autenticada (sidebar + topbar/breadcrumb +
  nav + user menu). Guarda de sessão **client-side** via `useCurrentUser`/`GET /profile` (ver nota
  de segurança abaixo) — redireciona pra `/login` sozinho se não autenticado.
  - **Reconstrução em duas passadas, a segunda a partir do JSX real decodificado** (ver o aviso
    grande no topo desta seção "Frontend" sobre o bundle comprimido em `docs/toToggle.html`). A
    primeira passada comparou só contra screenshots (`server/prototipo.png`/`atual.png`) e acertou
    a estrutura geral mas errou detalhes finos que só o JSX real revela — corrigidos na segunda
    passada, com o `app.jsx` decodificado como fonte:
    - Nav items: ícone (`apps`/`users`/`check`/`clock`, 17px) + `<span className="count">` (NÃO
      `.badge` — classe própria, `.nav-item .count`/`.nav-item.active .count` no CSS do
      protótipo). Applications/Teams mostram a contagem **sempre**, até "0" (`apps.length`/
      `teams.length` reais, não condicional); só Approvals é condicional (`pendingApprovals > 0`);
      History nunca tem contador.
    - Marca: `to<b>Toggle</b>` (dois pesos, não um wordmark plano) + subtítulo `.brand-sub`
      "feature flags" minúsculo (CSS faz o uppercase).
    - Rodapé da sidebar: `.user-chip` (classe própria, com borda — não `.nav-item` reaproveitado)
      contendo `.avatar` + `.nm` (nome) + `.rl` (linha com `RoleBadge`, componente já existente) +
      chevron (`Icon` ganhou o glifo `"chevron-down"`).
    - **Topbar é um breadcrumb de verdade** (`.crumbs` > `.c.link` "Applications" sempre clicável
      + `.sep` "/" + `.c.now` pra seção atual), não um rótulo único — corrigido de uma versão
      anterior que só mostrava uma string.
    - **3º nível do breadcrumb ("Applications / {app.name} / Toggles") — corrigido numa fase
      posterior.** `AppShell` não busca dados de aplicação individual, então precisava de um jeito
      de `ApplicationDetailScreen` "avisar" o nome pro shell. Solução: `AppShellContext` (ver
      `hooks/useAppUser.ts`) ganhou `setBreadcrumbApp`, passado via `Outlet context`;
      `ApplicationDetailScreen` chama `useSetBreadcrumbApp()` (novo hook,
      `hooks/useSetBreadcrumbApp.ts`) num `useEffect` assim que carrega o nome, e limpa no
      unmount — `AppShell` também limpa sozinho sempre que `location.pathname` sai de
      `/applications/`, pra não vazar o nome antigo pra outra rota. Confirmado: o 2º nível
      (`{app.name}`) usa classe `.c.link` (clicável, mas nosso app não tem uma ação de tab pra
      disparar — fica só visual), só o 3º (`Toggles`) é `.c.now`.
    - Confirmado (não no JSX de `App`, mas na página `ApprovalsView` em si): o **título da
      página**/breadcrumb de Approvals é "Approval Management", não "Approvals" — só o item de
      nav usa "Approvals". Corrigido em `screens/ApprovalsScreen.tsx` (`page-title` + `page-desc`
      condicional root/não-root).
    - `screens/ApplicationsScreen.tsx`: empty state trocado do texto solto em português pela
      estrutura confirmada `.empty` (ícone + `.et` + `.ed`), igual Approvals/TogglePaths.
  - **Terceira passada, depois de comparar 4 screenshots lado a lado (Applications + Toggles,
    protótipo vs. atual) e o usuário apontar mais divergência.** Encontrado via
    `validate_component_implementation(name="App", jsx_source="<div></div>")` — que expôs textos
    "ausentes" (`"New toggle"`, `"{stats.total}"`, `"Each path is a chain of toggles —"`) que
    nunca apareceram em `get_component_spec`/`get_full_jsx` por causa do truncamento "+N mais"
    (ver `docs/investigation/design-graph-findings.md`, Achado 2, pro log completo dessa
    investigação — pedido explícito do usuário). Confirmados e corrigidos:
    - `ApplicationDetailScreen`'s header estava faltando: botão de voltar como ícone
      (`.btn.btn-icon.btn-soft`, `Icon name="back"`) em vez do link de texto "← Applications";
      o parágrafo de descrição ("Each path is a chain of toggles —
      `service.feature.flag`. A path is active only when every segment is on."); e o contador
      "{on}/{total} active" ao lado do botão "New toggle". O contador usa `lib/toggleLeaves.ts
      #countToggleTree` (novo, port do `countTree()` real — soma TODO nó da árvore, não só
      folhas; como `ToggleNode.enabled` do endpoint hierarchy já vem cascateado, não precisa
      recalcular ancestorsOn como o protótipo faz).
    - `Icon.tsx`: praticamente todos os glifos (exceto `"toggle"`) eram aproximações "convenção,
      não confirmadas" — agora são os paths reais de `icons.jsx` (decodificado do mesmo bundle).
      Ganhou `"back"` (só faltava).
    - `brand-mark`: `Icon name="toggle" size={20}`, estava `18`.
  - **Quarta passada, o usuário reenviou as mesmas 4 screenshots pedindo pra olhar
    especificamente "o título" e "a forma dos menus" da sidebar.** CSS/JSX da sidebar batiam 1:1
    com a fonte confirmada nas checagens anteriores — a comparação visual direta com as
    screenshots revelou dois problemas que a comparação por texto tinha deixado passar:
    - **"Toggle" no `brand-name` renderizava branco, não verde**: `.brand-name b { color:
      var(--accent); font-weight: 700; }` estava **inteiramente ausente** de `global.css` — não
      era um valor errado, era uma regra que nunca existiu. Confirmado byte-a-byte contra o CSS
      real do protótipo. Esse é o "título" que o usuário via diferente.
    - **Ícone do item "History" era o glifo errado**: usávamos `Icon name="clock"` (relógio
      simples); o confirmado em `icons.jsx` é `"history"` (espiral + ponteiros), um glifo
      diferente por completo. Achado ao decodificar a v2.1 do bundle de novo — o `icons.jsx`
      dessa versão está em UUID **`3e33f8f3-815b-4114-9522-103e78d1bf31`**, diferente do UUID da
      v1 usado nas passadas anteriores (`e7669351-...`, já não existe no bundle atual). Também
      confirmado nessa passada: os nomes internos "gear"/"settings" e "chevdown"/"chevron-down"
      têm paths idênticos aos nossos — só apelidos diferentes, sem bug real.
    - **A sub-navegação da sidebar quando uma aplicação está aberta foi implementada de
      verdade** (antes só um plano documentado): `.nav-label` com o nome da app + "Toggles" (com
      contador do total de toggles) + "Service key" (com indicador `.key-active-dot` quando
      existe chave ativa) — confirmados no `app.jsx` real e agora visíveis na comparação lado a
      lado. `AppShellContext#setBreadcrumbApp` (nome só) virou `setOpenApp` (`hooks/useAppUser.ts
      #OpenAppInfo = {name, toggleCount, hasSecretKey}`), consumido tanto pelo 3º nível do
      breadcrumb quanto por esta sub-nav — um único ponto de verdade em vez de dois mecanismos
      paralelos. `useSetBreadcrumbApp` foi renomeado pra `useSetOpenApp`
      (`hooks/useSetOpenApp.ts`). Os dois itens de nav eram **âncoras de scroll reais**
      (`document.getElementById("toggles-section"|"service-key-section")?.scrollIntoView(...)`),
      um fake de estado de aba deliberado — nessa fase, a página ainda empilhava as duas seções
      (Toggles e Service key) numa página só, sem tabs de verdade pra imitar o
      `setTab("toggles"|"keys")` do protótipo. **Superado numa fase posterior**: virou aba de
      verdade (`OpenAppInfo#tab`/`onTabChange`) — ver o bullet sobre isso em "Detalhe de
      aplicação" acima, achado numa auditoria pedida pelo usuário que apontou exatamente essa
      lacuna (a sub-nav nunca marcava "Service key" como ativa). `hasSecretKey` vem de
      `SecretKeySection` via um novo callback opcional
      `onKeyPresenceChange?: (hasKey: boolean) => void` — mantém `SecretKeySection` como único
      dono do fetch de `GET /secret-keys` (não duplica a chamada em `ApplicationDetailScreen`).
      Também trouxe de volta pro `Icon.tsx` o path confirmado de `"layers"` (usado no item
      "Toggles" da sub-nav) e as regras `.nav-item svg { color: var(--ink-3) }`/`.nav-item.active
      svg { color: var(--accent) }`/`.key-active-dot` que também estavam faltando em
      `global.css`.
  - **Bullet original desatualizado — corrigido** (o item de nav "Guia de início"/onboarding foi
    construído numa fase seguinte, v2.6 §6.7-6.9, ver mais abaixo; este texto ficou obsoleto sem
    ser atualizado até uma auditoria de status geral encontrar a divergência entre este arquivo e
    o código real). **Ainda deliberadamente fora de escopo**: só a linha "Light mode" no rodapé
    (no protótipo é funcional de verdade, mas este app só suporta o tema escuro por decisão já
    documentada — replicar só visualmente seria UI morta). Confirmado byte a byte contra
    `get_full_jsx("App")` numa rodada posterior: o botão real é `{dark ? "Light mode" : "Dark
    mode"}` com ícone `sun`/`shield` alternando — a mesma decisão de omitir continua válida, não
    revisitada.
  - **`EditToggleDrawer` (regras de ativação) corrigido contra o `RULE_TYPES` real, achado no
    mesmo decode do bundle v2.1.** Uma fase anterior tinha inventado nome/descrição/placeholder/
    hint em português pros 7 tipos de regra porque, na época, `get_full_jsx("EditDrawer")` só
    mostrava a REFERÊNCIA a `RULE_TYPES` (o array em si vinha de `data.js`, um arquivo
    diferente, nunca puxado). Corrigido em `lib/activationRuleTypes.ts` pro texto real (inglês,
    confirmado): nomes/descrições/placeholders/hints exatos, e a ORDEM real — **canary é o 4º
    item, não o último** (`percentage, parameter, user_id, canary, ip, country, time`). Também
    achado: os cards de tipo de regra usavam o mesmo ícone genérico `"settings"` pros 7 — cada
    tipo tem um ícone confirmado próprio (`percent`, `sliders`, `user`, `rocket`, `globe`, `map`,
    `clock`), adicionados a `Icon.tsx` e ligados via um novo campo `icon` em `RuleTypeMeta`. O
    formato de UI em si (um único input de texto genérico rotulado "{Nome} value", cujo
    placeholder/hint mudam por tipo, em vez de campos estruturados por tipo) já batia com o
    confirmado — o backend também só valida "não vazio" pra qualquer tipo
    (`entity.ActivationRule.ValidateRule`), então não há formato obrigatório por trás.
- ✅ **Toasts** (`components/ToastProvider.tsx`, montado uma vez em `App.tsx` envolvendo todas as
  rotas) — sistema de feedback transitório, achado ausente numa auditoria pedida pelo usuário
  ("o sistema atual não dá nenhum sinal, alerta quando cria, remove, etc"): antes, criar/apagar/
  alterar algo com sucesso imediato não dava sinal nenhum (só o estado "aguardando aprovação",
  quando aplicável, tinha um banner inline por tela — `pendingNotice`, mantido como está, ele
  carrega mais contexto do que os 2.6s de um toast permitem ler). Port 1:1 do sistema real do
  protótipo (`app.jsx#toast`/`.toasts`/`.toast-wrap`, decodificado do bundle comprimido — ver o
  aviso grande no topo desta seção): pílula no rodapé central, ícone de check, 2.6s de vida, sem
  botão de fechar, JAMAIS um tipo de erro (o protótipo nunca falha de verdade, dados em memória —
  aqui também não wiramos toast de erro, banners inline continuam sendo a resposta certa pra
  erro real de API). `useToast()` chamado direto onde a mutação acontece (tela ou componente),
  sem precisar de prop nova em cascata. Cobertura mapeada 1:1 contra os `toast(...)` reais do
  `app.jsx`, inclusive quando NÃO tem toast (ex.: gerar service key e criar usuário não tocam
  `toast()` no protótipo — o modal que mostra a chave/senha provisória já É a confirmação;
  replicado aqui: `SecretKeySection`/`UserModal` não disparam toast nesses dois casos, só no
  revoke/delete). Mensagem genérica "Action submitted for approval" cobre todo caminho
  `pending_approval` (o protótipo usa o mesmo texto único pra qualquer tipo de ação enviada pra
  aprovação). `saveExpiration` (campo de dias de expiração em Approval Settings) não existe no
  protótipo — toast "Changes saved" coberto por extrapolação, mesmo tom das demais mutações
  silenciosas antes.
- ✅ **Applications** (`/`, `screens/ApplicationsScreen.tsx`) — lista real via `GET /applications` +
  `AppModal` (root/admin; `<select>` de time via `listTeamOptions` — root vê todos os times com
  `GET /teams`, outras roles só os próprios com `GET /profile/teams`, já que `POST /applications`
  não valida quem pode usar qual `team_id`). Trata o caso *approval-aware*: se a API responde `202
  {approval_required:true}` em vez de `201`, mostra aviso de "aguardando aprovação" em vez de
  inserir uma aplicação fantasma na lista. `AppCard` é link pra `/applications/:id`.
  - **`AppModal` (antes `CreateApplicationModal`, só criação) agora edita e apaga também** —
    adaptado do `AppModal` real (decodificado; design-graph nunca indexou este componente, só
    existe dentro da árvore autenticada de `App`). O botão de editar em `AppCard` (ícone lápis,
    `canEdit`, `e.preventDefault()+stopPropagation()` pra não navegar pro detalhe) abre o modal em
    modo edição; o botão "Delete" no rodapé do modal (só quando editando E `canDelete`, que é
    root — mesma regra de `ApplicationDetailScreen`) abre o `ConfirmModal` já existente e reusa
    `deleteApplication`. **Divergência deliberada do protótipo real**: lá o `<select>` de time
    aparece sempre, inclusive editando (modelo demo é 1 app = 1 time fixo em memória) — na API
    real `GET /applications` não traz o time atual de cada app (pediria N chamadas extras só pra
    popular esse combo) e `team_id` é **opcional** no `PUT /applications/:id` (omitir = mantém o
    time atual, confirmado em `docs/rest-flow.md` §6) — então editar aqui só mexe no nome; mover
    de time fica pra uma tela que já tenha o time atual carregado. `updateApplication`
    (`api/applications.ts`) é novo; devolve `ApplicationDetail` (o shape cru de
    `entity.Application`), não `Application`/`ApplicationWithCounts` (que não tem esse endpoint).
  - **`AppCard` ganhou glifo de duas letras** (`lib/applicationAccent.ts#applicationGlyph`, port
    1:1 do algoritmo real `name.split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase() ||
    "AP"`) — antes era só a primeira letra do nome. Nome do time (`app.team`) continua de fora:
    `GET /applications` não traz nome de time, exigiria uma query nova no backend (join com
    times) sem relação com o indicador de chave abaixo.
  - **Cor do glifo (`applicationAccent`) corrigida numa fase posterior, achada numa auditoria
    pedida pelo usuário ("diversidade de imagens e símbolos do protótipo não está refletindo")**.
    A fórmula CSS (`oklch(0.75 0.15 ${hue})`) já vinha confirmada, mas de onde `hue` saía não —
    a versão anterior assumia um hash determinístico do `id` cobrindo o círculo de cor inteiro
    (0–359°), documentado no próprio código como um chute por falta da fonte real. Decodificando
    `app.jsx` de novo, a fórmula real apareceu: `const HUES = [158, 230, 28, 274, 330, 195];
    const hue = HUES[apps.length % HUES.length]` — uma paleta CURADA de 6 cores, indexada pela
    ORDEM DE CRIAÇÃO da aplicação (quantas já existiam quando esta foi criada), não um hash do
    id. Substituído por `HUES_CYCLE` (as mesmas 6 cores) + `creationOrderIndex()`, que deriva essa
    posição a partir de `created_at` (a API não persiste um `hue` por app — não haveria como
    replicar "gravado uma vez na criação" sem esse campo novo no backend, então a posição é
    recalculada a cada carga a partir da ordenação por data, efeito idêntico na prática).
    `AppCard` passou a receber `accentIndex` como prop (calculado uma vez pra lista inteira em
    `ApplicationsScreen`) em vez de calcular sua própria cor a partir do `id`.
  - **Demais ícones do protótipo auditados contra `icons.jsx` real e confirmados sem gap**: toda
    entrada do `ICONS` do protótipo (29 glifos) que é usada em alguma tela de verdade já está
    portada em `components/Icon.tsx`. As únicas ausências reais (`sun`/`shield` — linha "Light/
    Dark mode" do rodapé da sidebar; `chevright` — só usado no `OnboardingModal`) pertencem a
    features já deliberadamente fora de escopo (documentado mais acima, seção AppShell). `code` e
    `flag` existem no objeto `ICONS` do protótipo mas não são usados em NENHUMA tela real dele —
    confirmado por busca no bundle inteiro; entradas mortas do próprio protótipo, não um gap
    nosso.
  - **3º stat "Key" e a faixa `.app-key-row` implementados** — o gap documentado antes aqui
    ("fecharia com uma query nova no backend") foi fechado: `entity.ApplicationWithCounts` ganhou
    `HasSecretKey bool` (`has_secret_key` no JSON), resolvido em
    `application_repository.go#GetAllWithToggleCounts` via `EXISTS(SELECT 1 FROM secret_keys sk
    WHERE sk.application_id = applications.id)` — um `EXISTS`, não um `LEFT JOIN` direto com
    `secret_keys`, porque isso multiplicaria as linhas de `toggles` já juntadas (uma app pode ter
    mais de uma secret key), inflando `COUNT`/`SUM` mesmo com `GROUP BY`. `AppCard` renderiza o
    3º `.app-stat` ("1"/"—", cor accent quando tem chave) e a faixa `.app-key-row` (ícone
    `lock`/`key`, "Service key active"/"No service key" + CTA "Manage"/"Generate") confirmados no
    `AppCard` real decodificado. Clicar na faixa navega pra `/applications/:id#service-key-section`
    (`e.preventDefault()+stopPropagation()` — é um `<button>` dentro do `<Link>` que envolve o
    card inteiro, mesmo padrão já usado pelo botão de editar) — diferente do protótipo, que abre o
    modal de chave direto sobre o estado em memória; aqui não há estado compartilhado entre a
    lista e o detalhe, então a ação equivalente é ir pra `ApplicationDetailScreen` e rolar até a
    seção real (`ApplicationDetailScreen` ganhou um `useEffect` que lê `location.hash` e
    `scrollIntoView` depois que os dados carregam — a section só existe no DOM nesse ponto).
  - **Achado, não corrigido**: `PUT /applications/:id` é approval-aware, mas o middleware
    `getActionType` (`internal/app/middleware/approval.go`) classifica **qualquer** `PUT` em
    `/applications` como `application_create` — não existe uma constante `application_update`
    (comentário no próprio Go: "PUT pode ser considerado update, mas não há constante
    específica"). Efeito prático: a flag de aprovação "Criar aplicação" também intercepta edições
    de nome. Backend pré-existente, não introduzido por este frontend — mencionado aqui porque
    afeta o que o modal de edição pode devolver (`onPendingApproval` reusa o mesmo `action_type`).
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
- ✅ **Detalhe de aplicação** (`/applications/:id`, `screens/ApplicationDetailScreen.tsx`) — grade
  de cards de toggles (`components/TogglePaths.tsx`+`ToggleCard.tsx`+`StatusRing.tsx`,
  reconstruídos de `get_component_spec("TogglePaths"/"ToggleCard"/"StatusRing")`), **um card por
  nó-FOLHA, nunca por nó intermediário** — substituiu um `ToggleTree.tsx` de lista indentada por nó
  que nunca teve componente de origem confirmado no protótipo (apagado nesta fase). Cada card mostra
  um `StatusRing` (verde/âmbar/vermelho), o path completo como segmentos individualmente clicáveis
  (`.seg-link`, cada um abre `EditToggleDrawer` pro id daquele nó específico — ancestral ou a
  própria folha), um switch pra ligar/desligar só a folha, e um badge RULE quando aquele nó tem
  regra de ativação. Toolbar com busca por substring do path completo (`lib/toggleLeaves.ts
  #filterLeaves`) + legenda de cores.
  - **Fusão de dois endpoints obrigatória**: `GET .../toggles?hierarchy=true` só dá `id`/`value`/
    `enabled` (este último já cascateado, own AND parent — nunca o bit próprio) e omite `toggles`
    em folhas; não carrega `has_activation_rule` em lugar nenhum. Pra decidir a cor certa do card e
    mostrar o badge RULE, é preciso o bit próprio (não cascateado) de cada nó do caminho — que só
    existe no endpoint plano (`GET .../toggles`, sem `hierarchy=true`, `api/toggles.ts
    #getTogglesFlat`, bare array — confirmado lendo `toggle_handler.go:281`, não documentado
    explicitamente em `docs/rest-flow.md`). `lib/toggleLeaves.ts#flattenToLeaves` funde os dois por
    id, andando a árvore e emitindo uma `ToggleLeaf` por folha com arrays paralelos
    (`segs`/`ids`/`rules`/`enabledOwn`, raiz→folha).
  - **Lógica de status corrigida depois de decodificar o JSX real** (ver o aviso grande no topo da
    seção "Frontend" — a primeira versão desta função foi escrita só com o CSS/spec do
    design-graph, que nunca expõe a lógica de `pathStatus`/`leafPaths`, só o JSX de render; a
    semântica "óbvia" que pareceu certa por inferência estava sutilmente errada em três pontos).
    `deriveCardState` agora é um port 1:1 do `pathStatus()`/`leafPaths()`/computação inline de
    `ToggleCard` reais (`data.js`/`paths.jsx` decodificados):
    - `leafOn` = **todo** segmento do caminho (raiz→folha) ligado — equivale a `status==="green"`,
      não "o bit próprio da folha" (o que a primeira versão assumia).
    - `status`: `"red"` só quando a **RAIZ** do caminho (índice 0) está desligada — não quando a
      folha está desligada. Se só a própria folha estiver desligada (raiz e demais ancestrais
      ligados), o status é `"amber"`, não `"red"` — contraintuitivo, mas confirmado no
      `pathStatus()` real (`if (!enabled[0]) return "red"`).
    - `cut` = índice do primeiro segmento desligado em **todo** o array (raiz→folha, folha
      inclusa) — pode apontar pra própria folha, não só pra um ancestral.
    - `hasRule` = **qualquer** segmento do caminho tem regra (`rules.some`), não só a própria
      folha (`rules[last]`, o que a primeira versão fazia).
    - `footText` do âmbar é **dinâmico**: `` `Blocked by ${segs[cut]}` `` — nomeia o segmento
      específico (mesmo quando esse segmento é a própria folha, o que soa estranho — "Blocked by
      reader" quando "reader" é a folha — mas é literalmente o que o protótipo faz).
    `buildChildrenCountMap` resolve o `childrenCount` real de
    QUALQUER nó clicado (não só a folha) pro hint de cascata do `EditToggleDrawer`.
  - Criação via `CreateToggleModal` (path com ponto, ex. `payments.card`), liga/desliga via o
    endpoint **recursivo** `PUT .../toggle/:id` (singular — desliga o nó inteiro e a subárvore de
    uma vez; o card calcula o próximo estado a partir do bit próprio da folha, já que o switch do
    card só recebe o id, não o valor desejado). Inclui `SecretKeySection` (gerar/regerar/apagar a
    service key; `GeneratedKeyModal` mostra a chave em texto plano **uma única vez** — só fecha
    depois de marcar "copiei e guardei"). **Regra de ativação** (`EditToggleDrawer`, botão
    "Configure" — no rodapé de cada card, só pra folha, já que ancestrais se configuram clicando no
    próprio segmento do path): liga/desliga status, ativa uma regra dentre os 7 tipos de
    `entity.GetRuleTypeOptions()` (`lib/activationRuleTypes.ts`) e salva via `PUT
    .../toggles/:id` (plural, não-recursivo — diferente do liga/desliga da árvore). Bug real
    encontrado testando ao vivo contra o servidor: `GET/PUT .../toggles/:id` devolve
    `activation_rule: {type:"", value:""}` (objeto truthy, **nunca `null`**) sempre que
    `has_activation_rule` é `false` — ler isso com `activation_rule?.type ?? null` resolvia pra
    `""` (um `ActivationRuleType` inválido) em vez de `null`. Corrigido extraindo a derivação pra
    uma função pura testável isoladamente (`deriveInitialRuleState`, em
    `lib/activationRuleTypes.ts`) que trata `has_activation_rule` como o único sinal confiável —
    nunca confia na forma/truthiness de `activation_rule` sozinho. **Exclusão** (toggle, aplicação):
    botão de lixeira no rodapé de cada card (só a folha pode ser apagada por essa UI — folhas nunca
    têm filhos, então a nuance de "nó com filhos não é apagado" abaixo nunca se aplica a um clique
    real aqui) e "Delete application" no cabeçalho (root only), ambos abrindo
    `components/ConfirmModal.tsx` (adaptado de `get_component_spec("ConfirmModal")`, casca genérica
    reutilizável sobre `Modal`). Nuance real da API confirmada ao vivo: `DELETE
    .../toggles/:toggleId` num nó **com filhos** responde `200 OK` normalmente mas **não apaga
    nada** (o handler não tem como sinalizar isso na resposta) — como a UI só oferece apagar folhas,
    isso nunca é alcançável por aqui, mas continua valendo pra API em si. Deletar a folha funciona e
    ainda faz bubble-up: se isso deixa o pai sem filhos, o pai também é removido — testado ao vivo
    (`payments.card` → apagar `card` → `payments` some sozinho também).
  - **Reescrito de página empilhada pra duas abas de verdade, achado numa auditoria pedida pelo
    usuário** ("a tela de toggles está diferente do protótipo" e "a tela de service key parece
    que hoje não existe, está a mesma de toggle"). Uma fase anterior tinha empilhado Toggles e
    Service key numa página só, com a sub-nav da sidebar fazendo `scrollIntoView` até
    `#toggles-section`/`#service-key-section` — o item "Toggles" ficava **hardcoded como
    `"nav-item active"`**, então nada na UI indicava visualmente que você tinha "trocado de
    tela" ao clicar em "Service key" (só rolava a mesma página). O `app.jsx` real (decodificado
    do bundle v2.3) confirma que `ApplicationDetail` é `tab === "toggles" | "keys"` de verdade —
    nunca as duas visíveis ao mesmo tempo, cabeçalho (descrição + contador "N/total active" +
    botão "New toggle") condicional por aba, sub-nav e o 2º nível do breadcrumb TROCAM a aba
    (`setTab`), não fazem scroll. Portado 1:1: `hooks/useAppUser.ts#OpenAppInfo` ganhou `tab` +
    `onTabChange` (a fonte real do estado continua em `ApplicationDetailScreen`, repassada pro
    `AppShell` do mesmo jeito que `hasSecretKey` já era); `AppCard`'s clique na faixa de chave
    virou `navigate(".../applications/:id?tab=keys")` em vez de um hash, lido uma vez no mount
    (`useSearchParams`) pra semear a aba inicial. As duas seções continuam montadas o tempo todo
    (`hidden`, não desmontadas ao trocar de aba) — não porque o protótipo faça isso (lá é troca de
    JSX renderizado, sem DOM escondido), mas porque `SecretKeySection` precisa continuar sendo o
    único dono do fetch de `GET /secret-keys` mesmo com o usuário na aba Toggles (o indicador
    `.key-active-dot` da sub-nav depende disso independente da aba ativa) — refazer esse fetch a
    cada troca de aba seria um retrocesso real de performance sem ganho nenhum.
  - **`SecretKeySection` reconstruído a partir do `KeysView` real** (mesmo decode) — a versão
    anterior era só um badge + botões numa linha, bem mais simples que o confirmado: `.keys-head`
    (título + hint "Shown only once when generated..." + "Rotate key" quando já existe chave),
    estado vazio ilustrado (`.key-empty`, ícone 54px + título + descrição + CTA primário), card da
    chave (`.key-single`, ícone + nome + "Created {data}" + botão Revoke) e o card "Lost the
    key?" (`.key-lost`, CTA de regenerar). **Uma linha do protótipo foi deliberadamente omitida**:
    `.key-masked-row`, que mostra a chave mascarada (`sk_live_••••••••1a2b`) — não existe backend
    nenhum pra isso (`entity.SecretKey` não guarda nem os últimos 4 caracteres, só o hash SHA-256
    completo, `json:"-"`); fabricar pontos genéricos fingindo ser a chave real seria inventar dado
    que não existe, então a linha inteira foi omitida em vez de simulada. Pelo mesmo motivo,
    "Last used {data}" no meta da chave também ficou de fora — não há tracking de último uso no
    backend, só `created_at`. Ganhou o glifo `"refresh"` em `Icon.tsx` (confirmado no `icons.jsx`
    real do mesmo bundle v2.3), usado tanto no botão "Rotate key" quanto em "Generate new key".
  - **v2.6 §3 (cascade delete/reversibilidade) — fatia de client-side landed** depois do backend
    virar soft-delete (toggles ganharam `deleted_at`/`deleted_by`/`archived_root`, delete virou
    recursivo-com-arquivamento em vez de recusar nó com filhos — ver bullet "Rotas de Toggles"/T0008
    acima e `internal/app/usecase/toggle_usecase.go`). Portadas as duas funções puras confirmadas
    do `data.js` real (bundle v2.6) pra `lib/toggleLeaves.ts`: `countDescendants`/
    `activeLeavesUnder`/`findToggleNode` (o backend tinha ganhado um `ToggleUseCase.
    CountDescendants` cedo demais nesta mesma sessão — removido de novo como código morto assim
    que ficou confirmado, pelo próprio plano original, que essa contagem é client-side a partir da
    árvore já carregada, sem endpoint novo). `ApplicationDetailScreen`'s `ConfirmModal` de deletar
    toggle ganhou o body confirmado 1:1 (`.confirm-toggle-path` + notice de descendentes + "Currently
    serving traffic on: {paths}") — na prática `descCount` é sempre 0 porque a UI só oferece apagar
    FOLHAS (`ToggleCard`'s botão de lixeira, nunca um ancestral), então só a segunda parte
    (`activeLeaves`) é realmente alcançável por aqui; as duas funções ficam prontas pra quando uma
    UI de apagar branch existir. `confirmLabel` do modal também corrigido pro literal confirmado
    "Delete toggle" (era um genérico "Delete" antes) — 3 testes existentes que clicavam o botão de
    confirmação por `/^delete$/i` precisaram ser re-escopados (`.modal-title` no título, `/^delete
    toggle$/i` no botão) porque o card também tem um botão "Delete" (ícone), agora ambíguo com o
    footer do modal.
  - **§3.3 (aviso "no effect right now")**: nova função pura `ancestorsEnabledFor(leaves, id)`
    em `lib/toggleLeaves.ts` — diferente de `countDescendants`/`activeLeavesUnder` (que operam
    sobre `ToggleNode`, cujo `enabled` já vem cascateado do endpoint hierarchy), esta opera sobre
    `ToggleLeaf.enabledOwn` (bit PRÓPRIO, não cascateado) porque é a única fonte com o bit próprio
    de um ancestral arbitrário — precisa saber qual segmento especificamente está desligado, não só
    se está. `EditToggleDrawer` ganhou `ancestorsOn`/`blockerSeg` como props novas (calculadas em
    `ApplicationDetailScreen` no momento de abrir o drawer, via `onEdit`) e o notice confirmado
    ("This has **no effect right now** — `{blockerSeg}` above it is off...") quando `enabled &&
    !ancestorsOn` — mesma condição `ineffective` do protótipo real. Só alcançável pelo drawer (o
    switch de Status do `ToggleCard`, diferente do do drawer, já vem `disabled` quando um ancestral
    está off — não dá pra chegar nesse estado por ali).
  - **Sufixo de auditoria correspondente, backend**: novo `ToggleUseCase.AncestorBlocker(toggle)`
    (equivalente Go do `ancestorsEnabledFor` do frontend, mas andando `ParentID` via
    `toggleRepo.GetByID` em vez de reler uma lista de folhas já carregada) — só chamado em
    `ToggleHandler.UpdateToggle` (o endpoint plural, não-recursivo, usado pelo drawer) quando
    `req.Enabled` é true, produzindo o sufixo confirmado `` ` <i>(no effect — {blocker} is
    off)</i>` `` no texto do evento `toggle_enabled`. **Achado escrevendo o teste de integração**:
    criar um `entity.Toggle{Enabled: false}` direto via `db.Create` num teste com GORM real não
    grava `false` — a coluna tem `gorm:"default:true"`, e como o zero-value de `bool` também é
    `false`, GORM não consegue distinguir "false explícito" de "não setado" na hora do INSERT e
    aplica o default do banco mesmo assim; corrigido fazendo `db.Create` com `true` e um
    `db.Model(...).Update("enabled", false)` logo depois (um UPDATE de verdade, fora do caminho do
    default). **Frontend**: `lib/auditEvents.tsx#renderAuditText` (o parser que reconhece só
    marcadores literais, nunca `dangerouslySetInnerHTML` — ver bullet "Rotas de Auditoria" acima)
    ganhou suporte ao segundo marcador `<i>...</i>` do protótipo real, com a mesma garantia de
    segurança do `<b>` já existente (só esses dois literais viram elemento React de verdade;
    qualquer outra tag, inclusive vinda de um valor malicioso, vira texto inerte).
  - **v2.6 §4 (Archived + Undo) — resto do Phase 2 fechado numa fase seguinte.**
    `components/ArchivedModal.tsx` porta 1:1 o `modals.jsx#ArchivedModal` confirmado (ícone
    `history`, `.confirm-app-row` por entrada, botão "Restore" com ícone `refresh`) — reusa
    `lib/auditEvents.tsx#formatAuditWhen` pro "há quanto tempo" em vez de portar o `timeAgo`
    próprio do `data.js` (as duas fontes confirmadas fazem exatamente a mesma coisa; duplicar só
    pra bater o nome original violaria a instrução de não espalhar a mesma lógica em lugares
    diferentes). Botão "Archived (N)" (`.btn.btn-soft.btn-sm`, ícone 14px) aparece entre o
    contador e "New toggle" só quando `canEdit && archived.length > 0` — `ApplicationDetailScreen`
    passou a buscar `GET .../toggles/archived` dentro do mesmo `Promise.all` de `load()`, mas só
    quando `canEdit` (a rota exige role admin, então um `user` somente-leitura nunca dispara um
    403 esperado). `api/toggles.ts` ganhou `restoreToggle`/`getArchivedToggles` (a última mapeia
    `deleted_at`/`deleted_by_name` pra `deletedAt`/`deletedByName`, mesmo padrão de camelCase do
    resto do client). Restaurar de dentro do modal NÃO fecha o modal (mesmo comportamento do
    `restoreArchived` real, que só filtra a entrada da lista em vez de fechar `setModal(null)`) —
    o modal relê `state.archived` (atualizado por `load()`) e re-renderiza a lista.
  - **Toast com ação + Undo de verdade**: `components/ToastProvider.tsx` ganhou um segundo
    parâmetro opcional em `notify(message, action?)` (`{label, onAction}`), com timeout 8000ms
    quando há ação (vs. 3200ms sem — bump confirmado da v2.3 pra v2.6, `setTimeout(...,
    action?8000:3200)` no `app.jsx` real) e um botão `.toast-action` que dispara `onAction()` e
    dispensa o toast na hora, sem esperar o timer. **Divergência deliberada do protótipo**: lá o
    Undo só reverte uma árvore em memória (`patchTree`), aqui é sempre uma chamada de API de
    verdade reaplicando o estado anterior — e essa chamada NUNCA passa pelo hook de intercept de
    aprovação (`useApprovalIntercept`), mesmo padrão do protótipo confirmado (seus fechamentos de
    Undo nunca checam `requiresApproval`) e também a única forma prática de evitar reviver um
    `guard()` de um componente que já desmontou (o caso do drawer, que fecha a si mesmo logo após
    salvar). Isso não é um buraco de segurança: o servidor continua sendo a autoridade final —
    se a aprovação estiver ligada, a chamada direta do Undo ainda volta `202`, e o handler mostra
    "Undo submitted for approval" em vez de fingir que aplicou. Três pontos de Undo, todos em
    `ApplicationDetailScreen.tsx`:
    - **Liga/desliga** (`handleToggle`): toast novo, que não existia antes desta fase (sucesso
      silencioso virou "Toggle enabled/disabled" com Undo) — `undoToggleEnabled` rechama
      `setToggleEnabled` com o valor invertido.
    - **Apagar toggle** (`confirmDeleteToggle`): `undoDeleteToggle` chama `restoreToggle` (não é
      approval-aware — desfazer uma exclusão já decidida/auditada não é mutação nova a revisar,
      então não há branch de `pending_approval` a tratar aqui).
    - **Mudar regra/status via drawer** (`EditToggleDrawer`): a assinatura de `onSaved` mudou de
      `() => void` pra `(previous: ToggleRuleSnapshot) => void` — o snapshot pré-edição
      (`loadState.toggle`, nunca tocado pelas edições locais) é capturado no próprio drawer
      (única fonte real dele) e repassado pro pai, que constrói o toast com `undoRuleChange`
      (rechama `updateToggleRule` com o snapshot). Precisou bubbling explícito porque o drawer se
      fecha (`onClose()`) logo depois de salvar — um Undo preso ao `guard()` do drawer tentaria
      mexer em estado de um componente já desmontado.
  - **v2.6 §5 (Keys & security) — Phase 3, numa fase seguinte.** Dois pontos do plano original
    exigiam decisão explícita do usuário antes de começar (registrado aqui pra rastreabilidade):
    (1) implementar `last_used_at` de verdade (em vez de deixar de fora) — decidido que sim; (2)
    manter a postura mais estrita de reset de senha (sem armazenamento reversível de senha em
    texto puro) em vez de igualar ao protótipo (que reexibe a senha temporária) — decidido manter
    a postura atual, sem trabalho novo.
    - **§5.1 — rotação de secret key com janela de overlap.** Antes, "gerar" era sempre "regerar":
      toda chave existente era apagada na hora, sem chance de atualizar consumidores sem um
      outage. Agora `entity.SecretKey` ganhou `IsCurrent bool`/`RevokedAt *time.Time` (migration
      `20260904000000_add_secret_key_rotation_and_usage.sql`) — uma aplicação pode ter até 2
      chaves vivas ao mesmo tempo (current + previous), a `previous` continuando a autenticar até
      alguém revogar explicitamente ou até uma PRÓXIMA rotação empurrá-la pra fora (só há espaço
      pra 1 previous por vez — `SecretKeyUseCase.rotateExistingKeys`, mesmo modelo 2-slots do
      protótipo real `KEYS[appId] = {current, previous}`). `ValidateSecretKey` (autenticação
      pública via X-API-Key) aceita QUALQUER chave não-revogada da aplicação, current ou previous
      — a distinção só importa pra UI. `DELETE /secret-keys/:id` deixou de apagar fisicamente
      (virou `RevokeSecretKey`, que só marca `RevokedAt` — histórico preservado); apagar de
      verdade (`DeleteSecretKey`, código morto? não — ainda usado pelos caminhos de limpeza de
      uma chave PENDENTE nunca aprovada, `RejectRequest`/`WithdrawRequest`, onde não há histórico
      real a preservar). **Achado real de GORM ao escrever o teste de integração**: criar um
      `entity.SecretKey{Enabled: false}`-equivalente (`IsCurrent`/booleans em geral) direto via
      `db.Create` não grava `false` quando a coluna tem `default:true` — o zero-value de bool
      também é `false`, então GORM não distingue "false explícito" de "não setado" na hora do
      INSERT; corrigido nos testes com `db.Create(true)` + `db.Model(...).Update(campo, false)`
      logo depois (mesmo bug/correção já documentado antes pra `toggles.enabled`, ver bullet
      "v2.6 §3.3" acima). **Frontend**: `SecretKeySection.tsx` reconstruído pra mostrar até 2
      "cartões" — o atual (`.key-single`, com "Last used" real agora) e, quando existe, um aviso
      de overlap (`.notice`, texto confirmado "The **previous key** is still valid during the
      rotation overlap window...") com um botão "Revoke previous now" **sem confirmação** (ação
      de menor risco — a atual continua funcionando). Diferente disso, rotacionar/revogar a chave
      ATUAL agora passa por um `ConfirmModal` primeiro (`"Rotate service key?"`/`"Revoke service
      key?"`, cópias confirmadas no `app.jsx` real via `handleGenerateKey`/`handleRevokeKey`) —
      gap real da versão anterior desta tela, que revogava a chave atual sem confirmação nenhuma;
      corrigido na mesma passada por já estar reconstruindo o componente inteiro. Rotacionar a
      PRIMEIRA chave de uma aplicação (nenhuma existente ainda) pula a confirmação — nada com que
      sobrepor. `.confirm-app-row`/`.skey-warn` (CSS) já existiam ou foram extraídos do HTML cru
      do protótipo (`.skey-warn` já estava, de uma fase anterior que construiu
      `GeneratedKeyModal`).
    - **§5.6 — `last_used_at` real.** Upgrade deliberado além do protótipo (que mostra "(demo —
      not tracked)"): `ValidateSecretKey` atualiza `LastUsedAt` a cada autenticação bem-sucedida,
      best-effort (nunca falha a leitura real por causa disso — é a rota pública mais quente do
      sistema). `SecretKeySection` mostra "Last used {tempo relativo}" reaproveitando
      `lib/auditEvents.tsx#formatAuditWhen` (mesma decisão de reuso já tomada pro `ArchivedModal`
      — ver bullet "v2.6 §4" acima) ou "never" quando `null`.
    - **§5.5 — "Forgot password?" (net-new).** Sem e-mail neste sistema — o pedido só vira um
      evento de auditoria (`password_reset_requested`, categoria access, `team_id` sempre nil —
      mesma regra root-only de `approval_system_toggled`) que um root/admin resolve de verdade via
      `POST /users/:id/reset-password` (já existia). `POST /api/auth/forgot-password`
      (`ForgotPasswordRateLimit()`, um limitador POR IP separado do de login — de propósito, pra
      tentativas de reset não consumirem o orçamento de tentativas de login do mesmo IP e
      vice-versa) sempre responde `200 {success:true}`, exista o username ou não (evita username
      enumeration) — só grava o evento de auditoria quando o usuário existe de verdade, decidido
      dentro do handler, nunca vazado pra resposta. Ator sintético (`AuditUseCase.RecordSystem`,
      `"system"`/`"System"`) porque não existe `*entity.User` real nesse momento (a ação acontece
      ANTES de qualquer sessão, na própria tela de login). `components/ForgotPasswordModal.tsx`
      porta 1:1 `auth.jsx#ForgotPasswordModal` (dois estados — formulário / confirmação — cópia
      confirmada "If **@{username}** exists, an administrator has been notified..."), aberto via
      novo link `.link-btn` "Forgot password?" em `.auth-links.center` no rodapé do formulário de
      `LoginScreen.tsx` (`.auth-links`/`.link-btn` extraídos do CSS cru do protótipo — não
      existiam ainda, essa era a primeira tela a precisar deles).
    - **§5.2/§5.3/§5.4 — sem mudança**, decisão/confirmação registradas acima.
  - **v2.6 §6 (Daily friction reducers) — Phase 4, começada numa fase seguinte.** Fonte real
    confirmada num arquivo só do bundle decodificado (`paths.jsx`, o mesmo de `TogglePaths`/
    `ToggleCard`/`StatusRing`) que expôs de uma vez a JSX de bulk-select (§6.5), favoritos (§6.4)
    E suggest-change (§6.6) juntos — os três tocam o mesmo componente, então foram implementados
    na mesma passada em vez de três reescritas separadas de `ToggleCard.tsx`.
    - **§6.5 — seleção múltipla.** Backend: novo `PUT /api/applications/:id/toggles/bulk`
      (`{toggle_ids, enabled}`) — liga/desliga o bit PRÓPRIO de cada ID da lista, nunca recursivo
      (diferente do singular `PUT .../toggle/:id`). `ToggleUseCase.BulkUpdateEnabled` reaproveita
      `UpdateToggleByID` num loop em vez de duplicar a validação de existência/appID —
      `UpdateToggleByID` **não tinha nenhum chamador real** antes desta fase (achado com
      `grep`, mesma classe de achado do `CountDescendants` morto da fase anterior), então isso
      resolveu um código morto pré-existente ao mesmo tempo que implementava a feature nova, em
      vez de duplicar lógica similar do zero. Approval-aware: reusa os action types
      `toggle_enable`/`toggle_disable` (mesma chave de aprovação do enable/disable recursivo —
      confirmado no protótipo real: `bulkToggle`'s pendingAction reusa o actionKey
      `"toggle.enable"`) em vez de criar um terceiro tipo — `middleware/approval.go#getActionType`
      distingue pelo path terminar em `/bulk`, checado ANTES do case genérico de `/toggles` (que
      classificaria errado como `toggle_update`, já que esse path também contém `/toggles`).
      `ExecuteApprovedAction` também precisou aprender a diferença: como bulk reusa os MESMOS dois
      action types do enable/disable recursivo singular, o dispatch agora checa
      `request.ToggleID == nil` (só bulk deixa isso nil de propósito — o singular sempre tem um
      toggle_id) pra escolher entre `executeToggleUpdateAction` (singular) e o novo
      `executeBulkToggleAction`. Texto de auditoria confirmado no protótipo real
      (`executePendingAction`, case `"bulkToggle"`): `` `${Enabled|Disabled} <b>${N}</b> toggles
      in bulk` `` (+ `" (after approval)"` na execução via aprovação), target = só o nome da
      aplicação. **Frontend**: `ToggleCard`/`TogglePaths` ganharam `selectMode`/`selected`/
      `onSelectToggle` (checkbox `.tg-check` substitui o `StatusRing` só nesse modo) + o chip
      "Select"/"Cancel selection" e a `.bulk-bar` ("N selected" + "Disable selected"/"Enable
      selected"), todas as classes CSS extraídas do CSS cru do protótipo (não existiam ainda).
      `ApplicationDetailScreen`'s `handleBulkToggle` segue o mesmo padrão `guard()` de
      `handleToggle`, com o toast de sucesso confirmado (`` `${N} toggles ${enabled ? "enabled" :
      "disabled"}` ``, sem Undo — o protótipo real não oferece undo pra bulk, só pra enable/
      disable/delete individuais).
    - **§6.4 — favoritos.** Puramente client-side, `localStorage` only, sem endpoint de backend
      nenhum (confirmado no protótipo real: chave `"totoggle_v2_favs"`,
      `"app:{id}"`/`"tg:{appId}:{path}"` como as duas formas de chave — `lib/favorites.ts` porta
      isso 1:1). `hooks/useFavorites.ts` usa `useSyncExternalStore` com uma store módulo-level
      compartilhada entre TODAS as instâncias do hook — necessário porque favoritar um toggle
      (`ToggleCard`) e uma futura lista de favoritos na sidebar são componentes MONTADOS AO MESMO
      TEMPO; sem estado compartilhado, favoritar num lugar só refletiria no outro depois de um
      reload. **Achado de ambiente rodando a suíte pela primeira vez com Node 25**: o
      `localStorage` global experimental do próprio Node (22+, ligado por padrão sem
      `--localstorage-file` configurado) sombreia o `Storage` de verdade que o jsdom provê em
      `window` nos testes — `localStorage.clear()`/`.getItem()`/etc. quebravam silenciosamente
      (viravam chamadas num objeto sem esses métodos). Corrigido em duas frentes: `package.json`
      (`"test": "NODE_OPTIONS=--no-experimental-webstorage vitest run"`, a correção real) e uso de
      `window.localStorage` explícito no código de produção (`lib/favorites.ts`) como documentação
      de intenção, não como fix por si só. O botão de favoritar em `ToggleCard` existe pra
      QUALQUER role (confirmado no protótipo: fica fora do branch `canEdit`/`!canEdit`) —
      diferente de Configure/Delete/o switch de verdade, que continuam exclusivos de quem pode
      editar. **Fechado numa fase seguinte**: a estrela em `AppCard` (aqui SIM gated por `canEdit`
      — confirmado no protótipo real, mesma condição do botão Edit, diferente da estrela de
      `ToggleCard`) e a seção "Favorited" na sidebar (`AppShell`, `.nav-label` "Favorited" + um
      `.nav-item` por app/toggle favoritado + `.nav-divider`, inserida no topo do `<nav>`,
      confirmada no `app.jsx` real). `AppShell` reaproveitou o `GET /applications` que já buscava
      só pra alimentar o badge de contagem — passou a guardar a lista inteira também, em vez de
      duplicar a chamada. Clicar num toggle favoritado navega com `?tab=toggles&search={path}`;
      `ApplicationDetailScreen` ganhou a leitura de `?search=` no mount (mesmo padrão de `?tab=`
      já existente pro clique em "Manage" na faixa de chave do `AppCard`). Uma entrada de
      favorito cujo app já foi apagado é descartada em silêncio (`.filter(Boolean)`/`.filter(f =>
      f.app)`, mesma resiliência do protótipo real) — nunca quebra a sidebar.
    - **§6.4 revisado — favoritos passaram a persistir no servidor** (fase posterior, a pedido
      explícito do usuário: "quando adiciona como favorito não está persistindo no perfil do
      usuário, quando desloga se perde, deve persistir"). O design original acima (localStorage
      only) era uma escolha deliberada, fiel ao protótipo real — mas o usuário quer o oposto: o
      favorito precisa sobreviver a logout/login e não ficar preso a um navegador/dispositivo
      específico, mesmo que isso divirja do protótipo. Backend novo: `entity.UserFavorite`
      (`user_id`, `favorite_key` opaco, uniqueIndex nos dois — migration
      `20260907000000_add_user_favorites_table.sql`), `UserFavoriteRepository`/`FavoriteUseCase`/
      `FavoriteHandler` sob `GET/POST/DELETE /api/profile/favorites` (ver docs/rest-flow.md §4) —
      sempre escopado ao usuário do próprio token de sessão, nunca um `:id` de rota. `Add`/`Remove`
      são idempotentes (favoritar 2x a mesma chave, ou remover uma já ausente, nunca é erro —
      `Add` usa `clause.OnConflict{DoNothing: true}` sobre a uniqueIndex). O usecase nunca
      interpreta o conteúdo da chave (formato opaco definido pelo frontend), só valida
      não-vazio/tamanho (`MaxFavoriteKeyLength = 300`, sanidade, não regra de negócio real).
      **Frontend**: `lib/favorites.ts` ficou só com as funções puras de chave (sem I/O);
      `loadFavorites`/`saveFavorites` (localStorage) foram REMOVIDAS, substituídas por
      `api/favorites.ts` (`listFavorites`/`addFavorite`/`removeFavorite`). `hooks/useFavorites.ts`
      manteve a mesma store módulo-level compartilhada via `useSyncExternalStore` (continua
      necessária pelo mesmo motivo de sempre — múltiplos componentes montados ao mesmo tempo), mas
      agora carrega uma vez por sessão de página via um `fetchPromise` cacheado (não refaz o GET a
      cada novo componente montado) e persiste cada toggle de forma **otimista**: atualiza o
      estado local synchronamente, dispara `add`/`removeFavorite` em background, e reverte a
      mudança local se a chamada falhar (favoritos nunca tiveram um caminho de erro visível, nem
      na era localStorage — o próprio estado voltando ao que era é o único sinal). **Achado de
      teste real, não só um detalhe de mock**: várias suítes (`ApplicationsScreen.test.tsx`,
      principalmente) usavam `vi.fn().mockResolvedValue(response)` — a MESMA instância de
      `Response` devolvida pra toda chamada de fetch — o que já funcionava enquanto a tela fazia
      só 1 fetch; com `useFavorites` agora sempre disparando um 2º fetch (`GET
      /profile/favorites`) no mesmo mount, o corpo da resposta (só pode ser lido uma vez via
      `.json()`) era consumido pela primeira chamada e a segunda lançava "body already used",
      quebrando a tela inteira. Corrigido trocando esses mocks pra `mockImplementation(() =>
      Promise.resolve(freshResponse()))`, uma instância nova por chamada. **Achado de e2e mais
      sério, pego só rodando a suíte INTEIRA (não arquivos isolados)**: um teste novo de
      regressão tentou prová persistência fazendo um "Sign out" de verdade sobre o contexto de
      `ROOT_STATE` — mas `ROOT_STATE` é a MESMA sessão (arquivo de storageState) que TODO outro
      spec do suite reusa via `global-setup.ts` (criada uma única vez pro run inteiro); esse
      "Sign out" apaga de verdade a sessão no servidor (`AuthUseCase.Logout` — ver seção de
      autenticação acima), quebrando cada spec que rodasse DEPOIS na mesma execução (cascata de
      ~24 falhas não relacionadas, reproduzida e diagnosticada nesta sessão). Corrigido reescrevendo
      o teste pra nunca deslogar a sessão compartilhada: a "sessão nova" é aberta num
      `browser.newContext()` totalmente à parte, autenticado via formulário de login de verdade —
      prova o mesmo ponto (favorito não vive em localStorage/memória de uma sessão específica) sem
      destruir o estado global do suite.
    - **Bug real reportado em uso ao vivo, achado logo depois de subir a persistência acima**: "não
      está aparecendo na barra os favoritos quando marco como favorito uma aplicação". Confirmado
      direto no banco (`sqlite3 db/toggles.db "SELECT * FROM user_favorites"`) que o `POST` tinha
      persistido normalmente — a aplicação favoritada existia, o registro existia — mas a sidebar
      nunca refletia isso. Causa raiz: uma corrida real entre o `GET /profile/favorites` disparado
      no mount (`ensureLoaded()`) e o clique em "Favorite" logo em seguida — em produção (rede de
      verdade, não o `fetch` mockado e instantâneo dos testes) nada garante que esse GET, que
      partiu ANTES do clique, também RESOLVE antes dele; quando a resposta (a lista de favoritos de
      ANTES do clique) chegava DEPOIS da atualização otimista, `cached = favorites` sobrescrevia o
      favorito recém-adicionado com a lista velha — o servidor tinha o dado certo, só a cópia local
      voltava a ficar desatualizada. Corrigido em `hooks/useFavorites.ts` com uma flag
      `localMutationHappened`: assim que qualquer `toggleFavorite` acontece, o estado otimista
      local passa a ser mais confiável que qualquer resposta do carregamento inicial que ainda
      esteja em voo — uma resposta tardia desse GET é só descartada, nunca mais sobrescreve
      `cached`. Regressão travada em `useFavorites.test.ts` controlando manualmente a ordem de
      resolução das duas promises (a inicial só resolve DEPOIS do toggle) — confirmado que o teste
      falha de verdade sem a correção antes de ser aceito como válido.
    - **Auditoria de status geral pedida pelo usuário** ("todas as mudanças pra fechar a v2.6 já
      foram implementadas e estamos sem pendências?") — revarredura de todo este arquivo atrás de
      marcadores de pendência (`ainda não`, `não corrigido`, `AINDA ABERTO`, `candidato a uma
      próxima passada` etc.) cruzados contra o código real e, quando possível, contra
      `get_full_jsx`/`get_full_texts` de novo. Achado um bug real de tradução no processo: o item
      de nav "Users" e o 3º nível do breadcrumb (`/users`) estavam com o rótulo em português
      ("Usuários") — `get_full_jsx("App")` confirma o literal `"Users"` (a fase 11, que traduziu o
      TÍTULO da página pra inglês, tinha deixado o rótulo do NAV ITEM de fora por engano, uma
      string diferente). Corrigido em `AppShell.tsx` (nav item + breadcrumb) e no teste
      correspondente. Ver a tabela de pendências reais abaixo (seção "Status v2.6") pro resultado
      completo desta auditoria.
    - ✅ **§6.6 — "Suggest a change" (rocket icon)**: completo. `ToggleCard`/`TogglePaths` já
      tinham o prop `onSuggest` (botão foguete ao lado do switch somente-leitura, só quando
      `!canEdit`) da mesma passada de §6.4/§6.5. Backend: `POST
      .../applications/:id/toggles/:toggleId/suggest` (`ApprovalHandler.SuggestToggleChange`,
      registrada em `toggleById` — fora de `RequireApprovalAware` de propósito, já que aqui virar
      uma solicitação nunca é condicional). Usa uma nova `ApprovalUseCase.CreateSuggestion`,
      extraída de `CreateApprovalRequest` via `createApprovalRequestUnchecked` (o núcleo comum de
      validação/persistência/audit), que pula o gate de `required_actions` — diferente de toda
      outra solicitação do sistema, uma sugestão SEMPRE vira um `ApprovalRequest` pendente, porque
      não há "aplicar direto" possível pra quem não pode editar. `teamID` resolvido via
      `GetUserTeamForApplication` (mesmo mecanismo de toda ação de toggle); a nota opcional do
      usuário é anexada à `description` (`"Suggested: enable/disable toggle — {note}"`) — visível
      no audit trail (History), não na linha da lista de Approvals, que sempre usa o label fixo
      por `action_type` (`ApprovalRow#ACTION_LABELS`), igual a qualquer outro enable/disable.
      Frontend: `components/SuggestChangeModal.tsx` portado 1:1 do `SuggestChangeModal` confirmado
      em `app.jsx` (nota opcional, cópia "Suggesting to **enable/disable** this toggle"), sem
      passar pelo `useApprovalIntercept` — não existe "aplicar direto" aqui pra interceptar.
      Coberto por testes de handler (real-DB, incl. negação pra quem não é membro do team), de
      componente e um e2e completo (`suggest-toggle-change.spec.ts`: usuário `user` sugere com
      aprovação desligada, root vê e aprova, toggle aplica).
    - ✅ **§6.1/§6.2 — command palette (⌘K/Ctrl+K)**: completo. Sem trabalho de backend — busca
      só sobre dados já carregados ou buscados sob demanda. `lib/commandPalette.ts` isola o
      cálculo puro dos 4 grupos/caps (Applications 5, Toggles 8, Teams 4, People 4 — cópia exata
      do `CommandPalette` confirmado em `app.jsx`: Applications aparece mesmo com a busca vazia,
      os outros 3 só depois de digitar algo), testável sem DOM. `components/CommandPalette.tsx`
      é a UI (scrim/box/input/grupos), portada 1:1, com Escape fechando via o próprio `onKeyDown`
      do input — sem precisar de um primitivo de pilha compartilhado (§8.3 continua não
      construído; não havia dependência real dele aqui, já que só uma camada — a paleta — reage a
      Escape/⌘K hoje). Dados e o atalho global vivem em `AppShell.tsx` (dono natural — é o shell
      que já busca `applications`/`teams`/`users` pros badges da sidebar, reaproveitados aqui em
      vez de um fetch duplicado): ⌘K/Ctrl+K abre/fecha (toggle, não só abre) via um único
      `window.addEventListener("keydown", ...)`; o índice de toggles de TODA aplicação (para a
      busca cross-app) é buscado em paralelo (`getToggleHierarchy` por app +
      `lib/toggleLeaves.ts#leafDottedPaths`, novo — só o path pontilhado de cada folha, sem
      estado/regra) **sob demanda na primeira abertura**, cacheado depois (`toggleIndex !== null`
      evita refetch). Gate por papel decidido em `AppShell` (não em `lib/commandPalette.ts`, que
      só filtra o que recebe): grupo Teams só para `root` (mesma regra de `/teams` ser
      `RequireRoot()` — mostrar um resultado de time pra quem não pode abrir a tela seria um link
      morto, divergência deliberada do protótipo, que não tinha essa restrição de rota); grupo
      People segue `canManageUsers` (root ou admin), igual ao item de nav "Usuários". Refactor
      colateral: os 3 states redundantes "lista completa" + "contagem" (`appCount`/`teamCount`/
      `userCount`) viraram só as listas completas (`applications`/`teams`/`users`), com as
      contagens dos badges derivadas via `.length` — a paleta precisava das listas completas de
      qualquer forma, manter os dois era duplicação. Um efeito colateral do teste encontrado ao
      vivo: como `commandPaletteData` agora roda em TODO render do `AppShell`, testes cujo mock de
      fetch devolvia o corpo de sessão pra QUALQUER path (inclusive `/api/applications`) faziam
      `applications.map` estourar assim que o fetch resolvia — `AppShell.test.tsx` ganhou um
      helper `mockFetch(user, overrides)` com defaults seguros pros endpoints auxiliares,
      substituindo ~20 mocks ad hoc duplicados no arquivo. Coberto por
      `lib/commandPalette.test.ts`, `components/CommandPalette.test.tsx`,
      `components/AppShell.test.tsx` (atalho, fetch lazy+cache, navegação, gate por papel) e
      `e2e/tests/command-palette.spec.ts` (root navega entre app/toggle/team pela paleta; admin
      nunca vê um resultado de Teams).
    - ✅ **§6.7-6.9 — onboarding wizard**: completo, fecha a Phase 4. Confirmado via design-graph
      (`get_component_full("OnboardingModal")` — não pelo bundle decodificado, técnica agora
      descontinuada, ver o aviso no topo desta seção "Frontend"): 7 passos (Welcome → Team →
      People → Application → Toggle → Service Key → Integration), `ObProgress` com barra +
      indicadores por passo, `ObLeft` (painel explicativo à esquerda de cada passo intermediário),
      `CascadeDemo` (visualização do efeito cascata no passo Toggle), syntax highlighter Kotlin/
      Gradle pro passo Integration. Diferente do protótipo (que recebe `onCreateTeam`/
      `onAddMember`/`onCreateApp`/`onCreateToggle`/`onGenerateKey` como callbacks de um App-
      monolito em memória), `OnboardingModal` chama a API real diretamente — mesmo padrão de todo
      outro modal de criação já existente (`CreateToggleModal`, `CreateApplicationModal` etc.).
      **Só root consegue completar o wizard**: criar um team é `RequireRoot()` no backend (nem
      approval-aware, sempre síncrono) — o item de nav "Getting started"/"Review setup" só aparece
      pra root em `AppShell.tsx`. `existingTeams`/`existingApps`/`existingUsernames` vêm de
      `AppShell` (já carregados pros badges/command palette) — evita um fetch duplicado só pra
      dedupe-by-name. Novo `lib/onboarding.ts`: `isOnboarded`/`markOnboarded` (localStorage
      `totoggle_v2_onboarded`, mesma flag do protótipo real, controla o rótulo do nav item),
      `suggestUsername` (reusa `lib/userDisplay.ts#slugUsername` + sufixo numérico incremental até
      não colidir com nenhum username existente — diferente do protótipo, que também gera a senha
      temporária no cliente; aqui o servidor já gera a senha em `POST /users`, só o username
      precisava de sugestão client-side), `findByNameCaseInsensitive` (dedupe genérico reusado nos
      passos Team e Application). Cada "Next" chama a API real do passo (criar team/usuário/app/
      toggle) e trata erro (403/409/rede) sem avançar — divergência deliberada do protótipo, que
      nunca falha por ser síncrono/em memória. Passo "Service Key" é opcional/pulável (hint "You
      can generate it later..."), mas se uma chave for gerada, exige o checkbox "I stored the key
      somewhere safe" antes de avançar (reusa `.skey-ack`/`.field-hint` já existentes). Amostras de
      código do passo Integration usam a API real do `totoggle_java` (`ToToggleConfig.builder()`,
      `ToToggleClient`, `isActive()`), verificada 1:1 contra
      `totoggle_java/src/main/kotlin/com/totoggle/client/`, não uma cópia cega do protótipo. Duas
      substituições deliberadas de ícone por falta de dado confirmado (design-graph não indexa o
      path SVG de ícones individuais, só o wrapper genérico do componente `Icon`): o card
      "Integration" do Welcome reusa `"settings"` em vez de um ícone "code" novo; toda seta "→"
      reusa `"chevron-down"` rotacionado -90°. CSS (`.ob-*`) derivado das tabelas de estilo
      estruturadas do design-graph + tokens já existentes — cores do syntax-highlighter não vieram
      confirmadas (só a estrutura veio), escolhidas por consistência com o design system, não
      inventadas do zero. Coberto por `lib/onboarding.test.ts`, `OnboardingCodeBlock.test.tsx`
      (tokenizer Kotlin), `OnboardingModal.test.tsx` (fluxo completo, dedupe, erro de API, Back
      sem re-criar, ack da chave obrigatório) e `AppShell.test.tsx` (gate por papel, rótulo do nav
      item), mais dois e2e reais (`onboarding-wizard.spec.ts`): fluxo completo confirmando que
      team/app/toggle/membro realmente existem no servidor (não só a tela de resumo), e reabertura
      do wizard reusando team/app já criados em vez de duplicar.
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
    solto era usado em todo lugar. Adicionado a `global.css`; aplicado aqui na aba Pending/Mine e,
    numa fase posterior, em `ApplicationsScreen` também — ainda pendente em Teams e outras telas
    com estado vazio (auditoria de CSS em andamento).
  - **Achado depois de decodificar o JSX real, NÃO corrigido ainda** (ver o aviso no topo da
    seção "Frontend"): a estrutura de abas construída aqui (Pending/Approvable, Mine, Settings —
    igual pra qualquer role) diverge do `ApprovalsView` real. Lá as abas dependem do role: root
    vê **Pendentes / Histórico / Configurações** (sem "Mine" — "Histórico" filtra
    `approvals.filter(a => a.status !== "pending")`, ou seja, só decisões já tomadas dentro do
    PRÓPRIO sistema de aprovação); não-root vê **Pendentes / Minhas solicitações** (sem
    "Configurações", que é root-only de qualquer forma). A aba "Mine" desta reescrita hoje
    aparece pra TODO mundo, inclusive root, o que o protótipo real nunca faz. Registrado como gap
    confirmado, não corrigido nesta passada — mudar isso é uma alteração de estrutura de abas, não
    um ajuste de CSS/copy.
- ✅ **History** (`/history`, `screens/HistoryScreen.tsx`) — reconstruído em 3 fases dentro da
  mesma reescrita, cada uma um achado real:
  1. Primeira versão reaproveitava `ApprovalRow` em modo `readOnly` sobre `GET /approval/requests`
     — o único rastro real disponível na época, porque o backend não tinha nenhum log de
     auditoria genérico.
  2. Uma auditoria contra o `HistoryView` real do protótipo (decodificado do bundle — design-graph
     não indexa esta tela, `get_screen_full("HistoryView")` só devolve o componente genérico
     `Icon`, confirmado de novo ao vivo nesta fase) revelou que o real é BEM mais rico — audit log
     categorizado (`AUDIT_CAT`/`AUDIT_ICON`/`AUDIT_DOT` em `data.js`: toggles/keys/access/
     approvals, ícone+dot colorido por tipo de evento, timeline com trilho vertical) — nada a ver
     com a lista plana da fase 1. Fechar isso de verdade exigia um audit log genérico no backend
     (tabela nova + hooks em toda mutação do sistema), a maior mudança de escopo cogitada nesta
     reescrita até então — decisão inicial (discutida com o usuário, 3 opções: faseado / completo
     / não construir) foi NÃO construir ainda, só reenquadrar título/descrição pra não fingir um
     audit trail que não existia ("Approval history" / "Not a full audit trail...").
  3. Retomado numa fase seguinte: o backend ganhou o audit log genérico de verdade (ver bullet
     "Rotas de Auditoria" acima — entidade, migration, `GET /api/audit` paginado por cursor,
     escopado por time) e esta tela foi reconstruída sobre ele pra valer. `components/AuditRow.tsx`
     é o item da timeline (`.audit-item`/`.audit-rail`/`.audit-dot`/`.audit-line`/`.audit-body`,
     confirmados no CSS real do mesmo bundle — nenhuma dessas classes existia em `global.css` antes
     desta fase). `lib/auditEvents.ts` mapeia `event_type` (granular, do backend) pro ícone/cor do
     dot — **única divergência deliberada do protótipo mantida**: lá um `type` genérico
     ("create"/"delete") é reusado entre domínios (apagar toggle E apagar usuário são ambos
     "delete", mesma cor); aqui cada `event_type` tem sua entrada própria, sem essa ambiguidade,
     mantendo a mesma intenção visual (verde=criado/ligado, âmbar=desligado/bloqueado,
     vermelho=apagado) — só a CATEGORIA de `user_deleted` muda (vira "access", não "toggles").
     Filtro por categoria (`.audit-filter`/`.chip`, já existentes,
     reaproveitados de Approvals) é resolvido no SERVIDOR via query param — diferente do
     protótipo, que filtra em memória sobre um array já carregado por inteiro; aqui, com paginação
     infinita, só uma fatia dos dados está carregada por vez, então trocar de categoria reinicia a
     paginação do zero. **Paginação infinita por `IntersectionObserver`** num sentinel no fim da
     lista (pedido explícito do usuário: nunca número de página) — busca a próxima leva de
     `GET /api/audit?cursor=...` quando o sentinel entra na viewport.
  4. **Auditoria de ícones/cores/textos pedida pelo usuário, achados reais corrigidos** (releu
     TODOS os 21 `logAudit(...)` reais do `app.jsx`, não uma amostra, pra montar a tabela de
     referência definitiva): `key_revoked` usava ícone "trash" — errado, o protótipo usa "key"
     pros dois lados de chave (gerar E revogar, mesmo type "key"; só o BOTÃO de revogar usa
     trash, não o evento de auditoria). `approval_rejected`/`approval_system_toggled` tinham
     ganhado um tratamento visual próprio numa passada anterior (ícone/cor distintos de
     approved) sem que o usuário tivesse pedido — revertido pro que o protótipo realmente faz:
     as três ações (aprovar/rejeitar/ligar-desligar o sistema) usam o MESMO type "approval"
     (ícone check, dot verde), sem diferenciação visual — só o texto muda. Três textos também
     incompletos, corrigidos no backend: regra de porcentagem não incluía o valor ("Set
     percentage rule" virou "Set percentage rule to 40%", confirmado contra
     `saveDrawer` real); gerar chave sempre dizia "Generated", nunca "Rotated" quando já existia
     uma (`SecretKeyHandler.GenerateSecretKey` agora checa existência ANTES de regenerar, já que
     regenerar sempre apaga a anterior primeiro); adicionar membro ao time não dizia QUEM foi
     adicionado ("Added member" virou "Added @username" — `TeamHandler` ganhou `userUseCase`
     como dependência nova só pra essa busca, ver comentário no construtor).
  5. **Usuário apontou "disposições diferentes" do protótipo, com um screenshot real anexo**
     (`prototipo.png`, na raiz do monorepo — não um caminho a reutilizar depois, era só o anexo
     daquela conversa). Achados, todos confirmados contra o `HistoryView`/`AUDIT_SEED` reais
     decodificados do bundle:
     - O empty state ("Nothing here yet") era irmão de `.audit`, não filho — perdia
       `position:relative;padding-left:6px` que `.audit` dá. Corrigido: agora sempre nasce
       dentro de `.audit`, igual ao JSX real (`<div className="audit">{empty}{items.map...}</div>`).
     - **Gap maior**: o protótipo bolda o termo-chave de cada linha (`"Disabled <b>experiments</b>
       branch"`) via `dangerouslySetInnerHTML` — a reescrita nunca reproduziu isso (decisão de
       segurança tomada na fase 3 acima, documentada no bullet "Rotas de Auditoria", mas sem uma
       forma seguro de aplicar o negrito real). Fechado agora com um parser próprio
       (`renderAuditText` em `lib/auditEvents.tsx`) que reconhece só o marcador literal
       `<b>...</b>` e monta um `<b>` React de verdade — nunca `dangerouslySetInnerHTML` — então
       XSS armazenado a partir de um nome de time/toggle/usuário malicioso continua impossível
       (testado explicitamente). Todo backend que grava texto de auditoria (toggle create/delete/
       rule/enable/disable, application create/delete, team create, member added, user create/
       delete/reset-password/status-changed, approval requested/approved/rejected) passou a
       embutir esse marcador em volta do termo-chave, igual ao protótipo real.
     - **Achado sobre a própria ferramenta design-graph, reportado ao usuário pra ajudar a
       melhorá-la** (não uma correção de UI): o buraco documentado no topo deste arquivo ("árvore
       autenticada de `App` nunca é indexada") não explica sozinho por que `HistoryView`
       aparece em `list_screens` mas devolve só o componente `Icon`. Causa mais específica,
       confirmada comparando `list_components` (54 componentes indexados, incluindo `UserRow`/
       `MemberRow`/`ApprovalRow` — sub-componentes de OUTRAS telas de lista) contra o JSX real: as
       telas cujo item de lista foi fatorado numa função própria (`function UserRow(...)`,
       referenciada como `<UserRow/>`) têm esse item indexado; `HistoryView` nunca fatorou o item
       da timeline — é markup inline dentro do `.map()` (~40 linhas de `<div className=
       "audit-item">`) — e o extrator não desce nessa árvore, só captura a única referência de
       componente real que existe lá dentro (`<Icon/>`). Sugestão passada ao usuário: o extrator
       deveria descer no corpo de um `.map()` mesmo quando ele não é uma chamada a outro
       componente, não só quando é. **Atualização**: o usuário depois atualizou o design-graph de
       verdade seguindo essa sugestão — `get_full_jsx("HistoryView")` e a seção "Audit item" de
       `get_screen_full` agora devolvem a árvore inline inteira (confirmado ao vivo, comparado
       linha a linha contra o que já tinha sido reconstruído via bundle: bate 1:1, só
       `dangerouslySetInnerHTML` continua divergente de propósito). `get_screen_layout`/
       `get_section` ainda não pegam essa seção — só `get_full_jsx` e a lista de "Sections" de
       `get_screen_full`.
  6. **Usuário apontou (de novo, sem imagem desta vez, descrevendo o problema) que cada item
     ainda estava em 2 linhas, deveria ter 3** — achado real, não visual: o protótipo sempre
     preenche `target` (linha do meio, entre texto e meta) pra praticamente todo tipo de evento
     (confirmado no `AUDIT_SEED`: as 7 entradas têm `target` não-vazio), mas metade dos handlers
     desta reescrita gravava `target: ""` — o item colapsava pra 2 linhas (texto+meta) por falta
     de conteúdo, não por bug de CSS. Corrigido handler por handler, com o texto/target exatos
     confirmados contra `app.jsx#logAudit`/`AUDIT_SEED` (não um padrão único — o protótipo real é
     inconsistente entre tipos, então cada um foi conferido individualmente):
     - `toggle_created`: target = nome da aplicação (não o path de novo, que já está em negrito
       no texto). `ToggleHandler` ganhou `applicationUseCase` como dependência nova só pra isso
       (não tinha nenhuma antes — só `toggleUseCase`/`auditUseCase`).
     - `toggle_enabled`/`toggle_disabled` (as DUAS rotas que geram esse evento — a plural via
       drawer, `UpdateToggle`, E a recursiva singular, `UpdateEnabled`/`UpdateEnabledRecursively`,
       que **tinha ficado de fora da fase 5** sem querer): texto bolda só o ÚLTIMO segmento do
       path (`Toggle.Value`), não o path inteiro (`Toggle.Path`) — confirmado
       (`app.jsx#saveDrawer`/`handleToggle`: `<b>${seg}</b>`, nunca o path completo); target
       combina nome da aplicação + path completo com `" · "`.
     - `toggle_deleted`: mesmo ajuste — bolda só o último segmento (`label.split(".").pop()` no
       protótipo), target é o nome da aplicação.
     - `key_generated`/`key_revoked`: target = nome da aplicação.
     - `application_created`/`application_deleted`: target = `"{team} team"`.
     - `user_created`: target = `"{team} team"` (reaproveita a busca de time que a validação
       "Time precisa existir" já fazia, só passou a capturar o resultado em vez de descartar com
       `_`).
     - `member_added` e `user_deleted`/`user_password_reset`/`user_status_changed` já tinham sido
       corrigidos na fase 5 (target = `"{team} team"` e `"@{username}"`, respectivamente) — sem
       mudança aqui.
     - **Deliberadamente não mexido**: `team_created` continua sem target (confirmado — o
       protótipo real nunca passa um terceiro argumento pra esse `logAudit`, e o próprio
       screenshot da fase 5 mostra esse item específico em 2 linhas de propósito) e os eventos de
       `approval_requested`/`approved`/`rejected` (sem uma fonte real inequívoca de `target` pra
       toda ação possível — action types variados demais pra um padrão único; registrado como gap
       conhecido, não corrigido nesta passada).
     Testes novos em `audit_integration_test.go` travam texto+target juntos pra cada caso (não só
     o texto como antes) — inclusive as duas rotas de enable/disable, que tinham 0 cobertura de
     integração antes desta rodada.
  7. **Usuário reportou (de novo) 2 linhas em vez de 3, pedindo pra checar se era o design-graph
     que não estava trazendo informação suficiente**. `get_screen_full("HistoryView")` (design-graph
     já atualizado desde a fase 5) devolve a seção "Audit item" e ela bate 1:1, campo por campo,
     com o que já estava implementado em `AuditRow.tsx` — não era um buraco da ferramenta desta
     vez. O achado real: a fase 6 só cobriu os handlers de **ação direta**; o fluxo de aprovação
     tem seu PRÓPRIO ponto de gravação de auditoria, separado, em
     `approval_usecase.go#ApproveRequest`/`ExecuteApprovedAction` — a função que registra o evento
     de domínio da ação que efetivamente rodou (não o "Approved: X" da aprovação em si, esse
     sempre esteve certo). Essa função (antes `auditEventForApprovalExecution`, agora
     `resolveApprovalExecutionAudit`) reaproveitava `request.Description` (o texto de "Requested:
     X", ex. `"Create toggle: payments.card.x"`) verbatim + `" (after approval)"` — nunca tinha o
     marcador `<b>` (então nunca tinha negrito real) e nunca preenchia `target` (string vazia
     sempre). Com aprovação ativada (comum em times reais — é o motivo de existir), TODA ação que
     passa por aprovação caía nesse caminho quebrado, não só uma fração — daí o usuário continuar
     vendo 2 linhas mesmo depois da fase 6 corrigir os handlers diretos.
     Reescrito por tipo de ação, com texto/target reconstruídos do zero (não mais reaproveitando
     `Description`) e confirmados contra `app.jsx#executePendingAction` do bundle real — que tem
     um padrão PRÓPRIO, diferente do handler direto equivalente:
     - `toggleEnable`/`deleteToggle`/`createToggle`: `target` = só o nome da aplicação — NUNCA
       `"{app} · {path}"` como a ação direta equivalente faz. Confirmado lendo o `logAudit(...)`
       de cada `case` do switch de `executePendingAction` (só 3 argumentos, o terceiro é sempre
       `params.appName`, nunca uma string combinada).
     - `deleteApp`: `logAudit("delete", ...)` é chamado com só 2 argumentos — **nenhum target**.
       2 linhas aqui é o render correto do protótipo real pra este evento específico (mesmo
       padrão do `team_created` da fase 6), não um gap; testado explicitamente
       (`TestAuditIntegration_ApprovalFlow_ApplicationDelete_TargetIsEmptyByDesign`) pra não ser
       "corrigido" de novo por engano numa rodada futura.
     - `toggle_rule`/`application_create` (edição)/`secret_key_create`/`secret_key_delete`: sem
       fonte real — o switch de `executePendingAction` não tem `case` nenhum pra esses tipos (o
       próprio protótipo nunca executa de fato uma aprovação de regra/edição de app/chave — só
       marca a solicitação como aprovada e para por aí, `pendingAction: null` nesses fluxos).
       Nosso backend executa a ação de verdade nesses casos (mais completo que o protótipo), mas
       como não há padrão real pra copiar, o `target` cai pro mesmo identificador que a ação
       DIRETA equivalente usa (nome da app pra chave, path pro rule-set — mesma escolha da fase 6
       pro evento direto).
     Resolução acontece **antes** do `switch` que executa a ação (não depois) — `toggle_delete` e
     `application_delete` apagam a entidade que o texto/target descrevem, então buscar nome/path
     depois da exclusão já seria tarde demais (mesmo cuidado dos handlers diretos, fase 6).
     Testes novos em `audit_integration_test.go` travam texto+target das duas exclusões via
     aprovação, e o teste de fluxo completo (`TestAuditIntegration_ApprovalFlow_
     RecordsRequesterAndExecutionEvents`) ganhou as mesmas asserções de negrito+target que os
     eventos diretos já tinham.
  8. **Usuário anexou DUAS imagens na raiz do monorepo (`prototipo.png` = protótipo real,
     `sistema.png` = a reescrita), pedindo comparação direta**: parte do conteúdo errado, parte só
     desproporcional (fontes/ícones/espaçamentos menores que o real). Dois achados distintos:
     - **Confirmado um SEGUNDO buraco do design-graph, agora em VALORES de estilo, não estrutura**
       (a estrutura já tinha sido corrigida na fase 5). `get_screen_full`/`get_section` pra
       `HistoryView` devolvem a JSX completa e correta, mas a lista de "Estilos" vem achatada —
       todas as classes aninhadas da seção (`.audit-item`, `.audit-dot`, `.audit-text`, `.audit-
       target`, `.audit-meta`, `.audit-av`) misturadas num único bloco truncado ("+16 mais"), sem
       dizer qual valor pertence a qual classe, e sem um `get_full_jsx`-equivalente pra pegar a
       lista completa. `get_component_spec`/`get_component_full`/`list_components` confirmam que
       `page-title`, `chip`, `empty`, `audit-*` nunca viram "componentes" de verdade (mesma causa-
       raiz da fase 5: markup inline, nunca fatorado numa função própria) — só `App` (o componente
       raiz, tipo "component" em `list_components`) chega perto, mas a própria ferramenta avisa
       "Extração truncada em: classes, styles, texts" pra ele, sem alternativa. E o bundle estático
       decodificado (fallback já documentado) só tem JSX, nunca CSS (confirmado varrendo todos os
       blobs do manifest + os dois `<style>` da página — nenhum bate com essas classes). Ou seja:
       pra estrutura/texto há fonte confiável agora; pra valor exato de font-size/padding, nenhuma
       — nem design-graph, nem bundle. Achado repassado ao usuário como feedback de novo.
     - **Correção aplicada** (`global.css`, classes compartilhadas por TODAS as telas de lista —
       Applications/Teams/Approvals/Users/History, não só History): sem fonte numérica confiável,
       recalibrado por julgamento visual comparando as duas imagens, ancorado nos tokens reais que
       `get_tokens`/`get_component_spec` confirmam existir no protótipo (`text_sm=13/14,
       text_base=15/16, text_lg=17, text_xl=20/21, weight_semibold=600, space_32`) — não valores
       inventados soltos. `.page-title` 25→30px, `.page-desc` 14→15px, `.chip` altura 30→34px/
       fonte 12.5→13px, `.audit-dot` 32→40px (ícone dentro continua `size={15}` — esse SIM é valor
       real, confirmado na JSX: `<Icon ... size={15} />`, não mexido), `.audit-text` 14→15px,
       `.audit-target` 12.5→13px, `.audit-meta` 12→12.5px, `.audit-av` 18→20px, `.page`/`.page-
       head` padding/margin 26→32px (space_32). Sem fonte de verdade, isso é uma primeira
       aproximação — pode precisar de outra rodada com um novo screenshot de comparação.
     - **Segundo achado real, de conteúdo (não de estilo)**: comparando `sistema.png` linha a
       linha contra o `AUDIT_SEED` real decodificado do bundle, os textos de `approval_requested`/
       `approval_approved`/`approval_rejected` — que a fase 6/7 tinham deixado como "gap conhecido,
       sem padrão único" — na verdade TÊM um padrão único, só que ele nunca tinha sido comparado
       contra o `AUDIT_SEED` (só contra a função `resolveApproval` do app.jsx, que diverge do seed
       nesse ponto — mesmo tipo de discrepância seed-vs-runtime já visto na fase 5/6, resolvida
       sempre a favor do seed por ser o que a screenshot realmente mostra):
       - `AUDIT_SEED` au5: `{ text: "Approved <b>Enable toggle</b> request", target:
         "home.recommendations" }` — sem ":" depois de "Approved" (a reescrita tinha), com um
         sufixo literal " request" (a reescrita não tinha), e com `target` preenchido (a reescrita
         sempre gravava `""`). `ApproveRequest`/`RejectRequest` corrigidos pra esse template
         exato; `RejectRequest` não tem exemplo direto no seed, mas usa o mesmo template por
         simetria de código-fonte (`${decision==="approved"?"Aprovou":"Rejeitou"} <b>${a.action}
         </b>` no app.jsx — mesma string, só o verbo muda) — inferência direta, não um chute solto.
       - O `target` de todo evento approval_requested/approved/rejected é o `path` que
         `requestApproval(actionKey, desc, path, pendingAction)` recebe em CADA callsite real —
         sempre o path/nome do que está sendo pedido (toggle path, nome de app), nunca o nome da
         aplicação (diferente do padrão de `resolveApprovalExecutionAudit`, pra depois da
         execução — os dois fluxos usam alvos diferentes de propósito, confirmado no código-fonte
         real). Novo método `ApprovalUseCase.approvalRequestTarget` resolve isso por tipo de ação,
         reaproveitando os mesmos repos já injetados.
       - Isso só funcionava sem duplicar o dado porque `middleware/approval.go` também mudou: a
         `description` de `toggle_create`/`application_create`/`application_update` (via aprovação
         automática, `createApprovalRequest`) parou de embutir o nome/path ("Create toggle: X" →
         só "Create toggle") — esse dado agora vive só no `target`, igual ao padrão real.
       Testes novos em `audit_integration_test.go` travam texto+target de requested/approved/
       rejected pros dois fluxos (toggle create, application create).
  9. **Usuário atualizou o plugin do design-graph e pediu pra testar de novo** (reconectou o MCP
     via `/mcp`). Apareceu uma tool nova, `get_full_styles(name= | screen=+section=)` — exatamente
     o que faltava: devolve a lista de estilos SEM o corte em "+N mais" que `get_screen_full`/
     `get_section`/`get_component` sempre aplicavam (mesmo buraco reportado na fase 8). Testado
     contra `HistoryView`/"Audit item" e contra `App`: funciona, lista completa confirmada (22
     propriedades pra "Audit item", antes cortado em 6+"+14/+16 mais").
     **Mas resolve só METADE do buraco da fase 8**: a lista continua achatando TODAS as classes
     aninhadas da seção (`audit-item`, `audit-rail`, `audit-dot`, `audit-line`, `audit-body`,
     `audit-text`, `audit-target`, `audit-meta`, `audit-av`, `.who`) num único array sem dizer qual
     propriedade pertence a qual seletor — `get_full_styles(name="audit-av")` e
     `name="audit-item"` devolvem "Componente não encontrado" (essas classes nunca viraram
     "componentes" de verdade, mesma causa-raiz de sempre). E `page-title`/`page-desc`/`page-head`/
     `chip`/`empty` continuam com ZERO estilos disponíveis por qualquer via — `get_screen("Users
     View")` confirma "Seções: 0" (só bloco `list_item` vira seção; um cabeçalho de página nunca
     vira). Ou seja: a lista completa ajuda MUITO quando dá pra atribuir por dedução (ver abaixo),
     mas não substitui atribuição por seletor de verdade.
     Ainda assim, cruzando essa lista completa contra os valores "recalibrados a olho" da fase 8,
     consegui atribuir com alta confiança 6 propriedades a seletores específicos — E ISSO PROVOU
     QUE PARTE DO AJUSTE VISUAL DA FASE 8 ESTAVA ERRADO, revertido nesta rodada:
     - `.audit-av`: width/height 18px (não 20), border-radius 5px (não 6), font-size 9px (não 10)
       — bate exatamente com um grupo coerente e completo (width+height+radius+font-size+weight+
       place-items, tudo junto, sem sobrar nada pra outro seletor plausível).
     - `.audit-item`: padding `4px 0` (não `5px 0`) — só esse valor de padding aparece na lista.
     - `.audit-body`: `padding-bottom: 18px` (não 22px), e o `padding-top: 3px` que eu tinha
       inventado na fase 8 não existe (o `margin-top: 3px` da lista pertence ao `.audit-meta`, não
       ao `.audit-body` — `flex:1`+`min-width:0`+`padding-bottom:18px` formam um grupo coerente
       sozinhos, sem `padding-top`).
     - `.audit-meta`: `margin-top: 3px` (não 5px, ver acima), `font-size: 12px` — revertido pra
       fase anterior à 8 por falta de qualquer evidência que justificasse o bump de 12.5px.
     - `.audit-meta .who`: `gap: 5px` (não 6px) — só esse valor de gap aparece na lista (o `gap:
       8px` do `.audit-meta` em si nunca aparece, então não mexi nele por falta de evidência
       inversa também).
     - `.audit-target`: `font-size: 12.5px` (não 13px) — revertido pela mesma razão do `.audit-
       meta` (bump da fase 8 sem nenhuma evidência real por trás).
     **Deliberadamente NÃO revertido** (bump da fase 8 mantido, por falta de qualquer evidência a
     favor OU contra): `.audit-dot` 40px, `.audit-text` 15px, `.page-title` 30px, `.page-desc`
     15px, `.chip` altura/fonte — nenhuma dessas propriedades apareceu de forma atribuível na lista
     completa (as três últimas nem podiam, já que `page-title`/`chip` não são seção nem
     componente). Continuam sendo julgamento visual, não confirmadas.
     Reportado ao usuário: a atualização resolveu o truncamento (achado principal da fase 8), mas
     não a atribuição por seletor — se quiser fechar esse resto, a ferramenta precisaria indexar
     `page-head`/`page-title`/`chip`/`empty` como seção (ou algo equivalente) mesmo não sendo
     `list_item`, e/ou atribuir cada propriedade da lista de `get_full_styles` ao seletor de
     origem em vez de só concatenar tudo.
  10. **Usuário: "acho que o banco estava desatualizado, tenta novamente"** — certo. O MCP tinha
      sido reconectado (`/mcp`) mas os dados indexados do protótipo `toToggle` ainda eram os de
      antes (mesmo `get_build_diff` "primeira build" da fase 9). Testando de novo nesta rodada, os
      dados finalmente atualizaram: `get_full_styles(screen=, section=)` agora agrupa por seletor
      de verdade (`## .audit-av`, `## .audit-body`, `## .audit-item` etc., cada um com só as
      próprias propriedades — não mais um array achatado), e `get_component_spec`/`search` passam
      a indexar classes CSS puras como um tipo próprio ("CssClass", rotulado explicitamente "não é
      um componente React nomeado") — `page-title`, `page-desc`, `page-head`, `.page`, `.empty`,
      `audit-filter`, `root-chip` todos resolvem agora.
      **Resultado, comparando contra os valores "recalibrados a olho" das fases 8/9: TODOS
      estavam errados.** `.page-title` 25px (não 30, valor da fase 8), `.page-desc` 14px/margin-
      top 5px (não 15/6), `.page-head` margin-bottom 26px (não 32), `.page` padding-top 26px (não
      32), `.audit-filter` gap 6px/margin-bottom 22px (não 8/26), `.audit-item` gap 14px (não 16),
      `.audit-text` 14px (não 15) — e um `.audit-target { margin-top: 2px }` que eu tinha
      inventado na fase 8 não existe em lugar nenhum. Todos revertidos pros valores ORIGINAIS
      (os de antes de qualquer ajuste visual desta sessão) — `git diff` em `global.css` deu vazio
      depois do revert: o arquivo bateu exatamente com o que já estava commitado, confirmando que
      a implementação original já estava certa o tempo todo.
      **`.chip` e `.audit-dot` continuam sem fonte real** — não por falta de indexação desta vez,
      mas porque os dois usam className DINÂMICO/computado (`"chip" + (cond ? " on" : "")`,
      `"audit-dot " + AUDIT_DOT[e.type]`), que o extrator de classe estática não segue. Dado o
      histórico de 100% dos meus chutes visuais terem saído errados nesta sessão, revertidos pro
      valor original também (32px/radius 9 pro dot, 30px/13px/13px pro chip), por Bayes — não por
      evidência direta.
      **Conclusão prática**: a diferença de tamanho que o usuário viu comparando `prototipo.png` x
      `sistema.png` quase certamente NÃO era um bug de CSS — era diferença de escala/zoom de
      captura entre as duas imagens (uma é preview isolado do design tool, a outra é screenshot de
      app real numa janela de navegador). A implementação já batia com o protótipo real antes de
      qualquer coisa desta sessão ser mexida. Fica registrado aqui pra não reabrir esse mesmo ciclo
      de "ajustar visual → provar errado → reverter" numa próxima vez que uma screenshot parecer
      diferente — antes de mexer em qualquer valor, chamar `get_component_spec`/`get_full_styles`
      primeiro (a versão atual do plugin já resolve isso pra classes com className estático).
  11. **Usuário: "analise só o sistema e o design graph, todas as páginas e a barra lateral, tem
      diferenças ainda"** — sem imagens desta vez (as duas de antes tinham sumido da raiz do
      repo), pedido pra auditar TODA a reescrita contra o design-graph diretamente, agora que ele
      indexa classe CSS pura (fase 10). Varredura tela por tela via `get_screen_full` em todas as 8
      telas indexadas (LoginScreen, TeamsView, ApprovalsView, FirstLoginScreen, UsersView,
      KeysView, ApprovalSettingsView, HistoryView) + `AppList`/`AppCard` (via `get_component`, não
      indexados em `list_screens` mas resolvem assim):
      - **Barra lateral (`AppShell`)**: confirmado — vive na árvore autenticada de `App`, que o
        design-graph NUNCA indexou, nem antes nem com a atualização (`sidebar`/`nav-item`/`brand`/
        `user-chip`/`topbar`/`crumbs` — nenhum resolve, nem como CssClass). Não é uma lacuna nova;
        a implementação já vem do bundle decodificado, documentado no próprio arquivo.
      - **Achados reais, corrigidos** (confirmados contra `get_screen_full`, não chutados):
        - `UserManagementScreen`: placeholder do campo de busca dizia "Buscar por username", o
          real é **"Buscar por nome ou username"** — E o filtro em si só olhava `username`, nunca
          `name` (bug funcional escondido atrás do texto errado, não só cosmético). Corrigido os
          dois; 2 testes novos travam busca por username E por nome.
        - `ApprovalRow`: botões "Approve"/"Reject" e chip de status "Approved"/"Rejected"/
          "Expired" estavam em inglês; o real (`get_screen_full("ApprovalsView")` → textos de
          `ApprovalRow`/`ApprovalStatusChip`) é **"Aprovar"/"Rejeitar"/"Aprovado"/"Rejeitado"/
          "Expirado"** — mesmo padrão bilíngue já usado no resto do app (a maioria dos textos
          descritivos é PT, alguns rótulos são EN; aqui o real é PT e a reescrita tinha ido pro
          inglês por engano). O branch "Pendente" do chip não existe no componente real (ele
          devolve `null` pra pending — quem chama já mostra os botões de ação nesse caso), mantido
          aqui só como extra deliberado pros usos read-only (aba "Mine", History), documentado
          como tal. Ícone "settings" vs. "gear" real CONFIRMADO como já documentado de propósito
          em `Icon.tsx` (mesmo glifo, nome diferente) — não é um bug, não mexido.
        - `SecretKeySection` (`.ks-name`): mostrava `state.key.name` (dinâmico); o real é um
          rótulo ESTÁTICO **"Service key"** — o campo `name` do backend nunca varia de fato (
          sempre `"API Access Key"`, nunca setável pelo usuário), então exibir o valor dinâmico só
          divergia do protótipo sem ganhar nada em troca. `.ks-meta` do real também mostra
          "· Last used {when}" — **não copiado**: não existe rastreamento de último uso nenhum no
          backend (sem coluna/lógica em `entity.SecretKey`); inventar um valor aqui seria pior que
          omitir. Registrado como gap de FEATURE (precisa de trabalho de backend: nova coluna +
          atualizar em toda autenticação por `X-API-Key`), não uma correção de texto.
      - **Telas conferidas e já corretas** (nenhuma mudança): `TeamsView`/`MemberRow`/`RoleBadge`
        (já citavam a fonte real em comentário, bateram 1:1), `ApprovalSettingsView`/
        `ApprovalSettingsPanel` (bate literalmente palavra por palavra, inclusive o texto
        condicional ativo/desativado), `AppList`/`AppCard`/`ApplicationsScreen` (já tinha o gap
        conhecido de `app.team` documentado — API não traz nome de time nessa listagem — nada
        novo), `LoginScreen`/`FirstLoginScreen` (já documentadas como reconstrução DELIBERADA, não
        cópia literal, por causa da autenticação real via bcrypt vs. o login-demo do protótipo;
        rótulo "Usuário" vs. "Username" do real é a única diferença de uma palavra, julgada baixo
        valor numa tela já marcada como adaptação intencional — não mexida).
      - **Não coberto nesta rodada** (não auditado, candidato a uma próxima passada se o usuário
        pedir): `ToggleCard`/`TogglePaths`/`EditToggleDrawer`/`CreateToggleModal` (a aba "Toggles"
        de `ApplicationDetailScreen`) e `AccountSecurityScreen`.
      4 arquivos de teste atualizados (`UserManagementScreen.test.tsx`, `ApprovalRow.test.tsx`,
      `ApprovalsScreen.test.tsx`, `SecretKeySection.test.tsx`) — `tsc`/`vitest`/`build` verdes
      (395 testes).
  12. **Usuário: "faca uma varredura em todas as telas... levante os gaps (evite css inline, faca
      um mapa para organizar de forma global se houver)"** — fechou a cobertura que tinha ficado
      de fora da fase 11 (`ToggleCard`/`TogglePaths`/`ChangePasswordForm`/`AccountSecurityScreen`)
      e respondeu à parte de CSS inline com um levantamento, não um chute.

      **Mapa: tela desta reescrita → fonte real no design-graph → status**
      | Tela/componente (`server/web/src`) | Fonte real (design-graph) | Status |
      |---|---|---|
      | `HistoryScreen`/`AuditRow` | `HistoryView` | ✅ confere (fases 5–9) |
      | `TeamsScreen`/`MemberRow`/`RoleBadge` | `TeamsView` | ✅ confere (fase 11) |
      | `ApprovalsScreen`/`ApprovalRow` | `ApprovalsView` | ✅ corrigido (fase 11: labels PT) |
      | `ApprovalSettingsPanel` | `ApprovalSettingsView` | ✅ confere literalmente (fase 11) |
      | `UserManagementScreen`/`UserRow`/`StatusPill` | `UsersView` | ✅ corrigido (fase 11: busca) |
      | `SecretKeySection` | `KeysView` | ✅ corrigido (fase 11: nome estático) |
      | `ApplicationsScreen`/`AppCard` | `AppList`/`AppCard` | ✅ confere (fase 11) |
      | `LoginScreen` | `LoginScreen` | ✅ reconstrução deliberada, documentada (auth real ≠ demo) |
      | `ForcedPasswordChangeScreen` | `FirstLoginScreen` | ✅ idem |
      | `ChangePasswordForm`/`AccountSecurityScreen` | `ChangePasswordModal` | ✅ confere (fase 12) — regra de senha mínima (4, não 8) é do backend de propósito |
      | `TogglePaths`/`ToggleCard` | `TogglePaths`/`ToggleCard` | ✅ confere quase byte a byte (fase 12) |
      | `AppShell` (barra lateral) | *(não indexado)* | ⚪ fora do alcance do design-graph — árvore autenticada de `App` nunca indexada; fonte é o bundle decodificado |
      | `EditToggleDrawer`/`CreateToggleModal`/`StatusRing` | — | ⚪ não auditados ainda (candidatos a uma próxima passada) |

      **CSS inline — achado, não um chute**: censo (`grep -rhoE 'style=\{\{[^}]+\}\}'`) mostrou
      `style={{ color: "var(--danger)" }}` repetido 11–13× (sempre junto de `className="field-
      hint"`, o padrão de mensagem de erro). Antes de "corrigir" isso, conferido contra várias
      capturas de `get_screen_full` já feitas nesta sessão (`LoginScreen`, `FirstLoginScreen`,
      `ChangePasswordModal`) — **o próprio protótipo real usa exatamente esse mesmo par inline**
      (`{err && <div className="field-hint" style={{ color: "var(--danger)" }}>{err}</div>}`,
      literal, confirmado). Ou seja, o inline aqui não é um desvio desta reescrita — é fidelidade
      ao próprio protótipo, que também não tem uma classe dedicada pra erro. Extrair uma classe
      nova pra isso teria sido inventar algo que o design system real não tem.
      Dito isso, a repetição em 13 arquivos É uma oportunidade real de organização (o pedido do
      usuário), sem risco de fidelidade: um modificador `.field-hint.danger` produz o MESMO CSS
      computado que o inline produzia — invisível pra qualquer comparação visual ou de conteúdo
      contra o protótipo. Adicionado em `global.css` e aplicado nos 13 arquivos (`className="field-
      hint danger"` em vez de `className="field-hint" style={{ color: "var(--danger)" }}`,
      preservando qualquer prop extra de `style` que existisse ao lado, ex.: `marginTop`).
      Fora isso, o resto do inline styling do app (que é bastante — dezenas de `style={{...}}`
      espalhados) reflete literalmente o que as capturas reais de `get_screen_full`/`get_full_jsx`
      mostram: o protótipo em si usa inline pra ajuste de layout pontual (flex/gap/margin de um
      elemento específico) e só promove pra classe CSS nomeada o que se repete em VÁRIAS telas
      (`.btn`, `.badge`, `.field`, `.page-*`, `.audit-*` etc.). Eliminar todo inline restante
      divergiria do próprio protótipo, não aproximaria dele — não foi feito.
      `tsc`/`vitest`(395)/`build` verdes depois da consolidação.
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
- ✅ **v2.6 §7 — Audit trail: filtros, before/after, CSV export e Activity por aplicação**
  (Phase 5 do plano). Confirmado via design-graph (`get_component_full("AuditToolbar"/"AuditChips"/
  "AuditFeed")`, `get_screen_full("HistoryView")`), não pelo bundle decodificado (técnica
  descontinuada — ver o aviso no topo desta seção "Frontend").
  - **Backend**: migration nova (`20260905000000_add_audit_log_application_and_diff_columns.sql`)
    acrescenta `application_id`/`before_value`/`after_value` a `audit_logs` (sem FK explícita,
    mesmo padrão já usado por `toggles.deleted_by` — SQLite recusaria um INSERT referenciando uma
    aplicação já apagada, e `application_deleted` grava DEPOIS do delete de propósito) + índice em
    `actor_id` (faltava desde a criação da tabela, agora faz parte do WHERE de todo filtro por
    ator). `AuditUseCase.Record` virou um núcleo privado (`record`) com 5 métodos públicos
    finos por cima — `Record` (sem app/before/after), `RecordSystem` (ator sintético, já existia),
    `RecordForApplication` (resolve team_id da aplicação E grava application_id — só seguro
    quando ela ainda existe no momento da chamada), `RecordRuleChange` (mesma resolução, mas
    também grava before/after — único evento que os popula, `toggle_rule_set`; `ToggleHandler`
    busca o toggle ANTES de `UpdateToggleWithRule` rodar pra capturar o "before") e
    `RecordWithApplication` (teamID E applicationID já resolvidos pelo chamador, sem re-resolver
    nenhum dos dois — único uso: `ApprovalUseCase.recordAuditWithApplication`, ver bug real
    abaixo). `List` ganhou `AuditListOptions{Category, ActorID, CreatedAfter}` (era só
    `category`); `repository.AuditLogFilter` substitui os parâmetros posicionais antigos de
    `List` por uma struct só, com dois modos de escopo mutuamente exclusivos documentados no
    próprio tipo — sem escopo nenhum (History, root-only) ou por `ApplicationID` (Activity,
    qualquer autenticado vê, mesma postura de `GET /applications/:id`). `ListForApplication` e
    `ListActors` não recebem `caller` (não fazem mais sentido receber: ver decisão abaixo).
    Handler ganhou `GetAuditActors` (`GET /audit/actors`) e `GetApplicationAudit`
    (`GET /applications/:id/audit`); `parseAuditPaging`/`paginateAuditLogs` extraídos pra evitar
    duplicar a lógica de cursor+limit+lookahead entre os dois endpoints de listagem.
  - **Decisão revertida a pedido explícito do usuário**: uma primeira versão desta feature
    manteve `GET /api/audit` aberto a qualquer role autenticado, escopado por time pra quem não é
    root (`domain/policy.AuditAccess`), como divergência deliberada do texto confirmado do
    protótipo ("Root only — changes to toggles live in each application's Activity tab") — a
    justificativa foi não remover uma visibilidade já testada/em uso. O usuário reportou
    diretamente que isso estava errado ("history só é exibido para root, admin e user não veem
    history") depois de ver admin/user enxergando o audit trail geral quando deveriam ver só a
    Activity tab de cada aplicação. Revertido pra bater com o texto confirmado: `GET /api/audit` e
    `GET /api/audit/actors` agora exigem `RequireRoot()` (routes.go); `AppShell.tsx` esconde o
    item de nav "History" pra quem não é root (`rootOnly: true`, mesmo mecanismo de "Teams &
    people"). `domain/policy.AuditAccess` foi apagado inteiro (ficou morto: só root chega em
    `List`/`ListActors` agora, então não há mais visibilidade nenhuma pra calcular) — junto com
    `AuditLogFilter.TeamIDs`/`Unrestricted` e a assinatura `ListActors(teamIDs, unrestricted)`,
    todos igualmente mortos pelo mesmo motivo. A Activity tab por aplicação passou de COMPLEMENTO
    a ÚNICA forma de admin/user verem mudanças — daí a pergunta do usuário também cobrir se ela já
    mostra "criação de toggle, desligamento, etc": cobre (todo evento de toggle/aplicação/chave
    grava `application_id` via `RecordForApplication`/`RecordRuleChange`/`RecordWithApplication`,
    incluindo desde a correção anterior os eventos executados via workflow de aprovação — ver "Bug
    real" abaixo); só os eventos do PRÓPRIO fluxo de aprovação (requested/approved/rejected/
    withdrawn) ficam de fora de propósito, por não serem uma mudança de domínio ainda efetivada.
  - **Posicionamento da Activity tab decidido com o usuário, não confirmado pelo design-graph**:
    `ActivityView` só aparece ligado à árvore de `HistoryView` no grafo indexado (nunca a uma tela
    de detalhe de aplicação — nenhuma existe como "Screen" própria, mesmo buraco de cobertura da
    árvore autenticada de `App`), e o comentário já confirmado no código desta reescrita dizia que
    a aplicação só tinha 2 abas reais ("toggles"/"keys"). Perguntado diretamente: usuário escolheu
    adicionar "Activity" como 3ª aba em `ApplicationDetailScreen` (`hooks/useAppUser.ts#
    ApplicationDetailTab` ganhou o valor `"activity"`; `AppShell.tsx` ganhou o 3º item de sub-nav
    e o 3º ramo do breadcrumb). Fica montada o tempo todo como as outras duas (`hidden`), mesmo
    padrão de `SecretKeySection`.
  - **Frontend**: `lib/csvExport.ts` (`toCSV`/`downloadCSV`, Blob+`<a download>`, CSV RFC 4180 —
    aspas dobradas, nunca barra invertida) reusa `stripAuditMarkup` (novo, em `lib/auditEvents.tsx`,
    ao lado de `renderAuditText` — mesma garantia de nunca interpretar `text` como HTML de
    verdade, só remove os marcadores `<b>`/`<i>` pra virar célula de planilha plana).
    `components/AuditToolbar.tsx` porta o `<select>` de ator + 4 chips de intervalo + botão Export
    1:1, com uma adaptação deliberada: o protótipo filtra por NOME solto; aqui o backend filtra
    por `actor_id` exato, então o `<select>` usa `{id,name}` de verdade. **Refactor colateral
    importante**: a paginação infinita por cursor (antes só dentro de `HistoryScreen`) virou
    `components/AuditFeed.tsx` — reusado por `HistoryScreen` E pela nova Activity tab, evitando
    duplicar a mesma lógica de fetch/scroll/sentinel/estados de loading-erro-vazio nos dois
    lugares. `AuditFeed` só se importa com uma função `fetchPage(cursor?)`; quem chama decide o
    que "categoria"/"ator"/"intervalo"/"application_id" significam. **Bug real encontrado
    construindo isso**: um `data`/`next_cursor` ausente (slice nil no Go serializa como `null`
    dentro de um `gin.H`, nunca omitido) quebrava `entries.length` — `AuditFeed` agora trata os
    dois com `?? []`/`?? ""`, mesmo cuidado já documentado noutros endpoints opcionais deste
    backend. `AuditRow.tsx` ganhou a linha "{before} → {after}", só quando os dois não são `null`.
  - **Bug real reportado em uso ao vivo, encontrado DEPOIS do build inicial desta feature**: com o
    workflow de aprovação ligado, a Activity tab de uma aplicação ficava sempre vazia, mesmo com
    atividade de verdade acontecendo (naquele momento History ainda era team-scoped pra qualquer
    role e continuava funcionando, por não depender de `application_id` — isso mudou depois, ver a
    decisão de restringir History a root, acima). Causa raiz: `ApprovalUseCase.ExecuteApprovedAction` grava o
    evento de domínio final de uma ação aprovada por um caminho próprio (`recordAudit`, separado
    da execução DIRETA sem aprovação que vive nos handlers HTTP) — só esse segundo caminho tinha
    sido migrado pra `RecordForApplication`/`RecordRuleChange` durante o build original desta
    seção; o caminho de aprovação nunca tinha sido revisitado e continuava chamando `AuditUseCase.
    Record` puro, sem `application_id`. Corrigido com `AuditUseCase.RecordWithApplication(eventType,
    text, target, teamID, applicationID *string, actor)` — recebe teamID E applicationID já
    resolvidos pelo chamador (ao contrário de `RecordForApplication`, não re-resolve team_id a
    partir da aplicação: `ApprovalRequest` já carrega os dois valores corretos, uma segunda
    resolução seria redundante e poderia divergir) — e um novo `recordAuditWithApplication` em
    `approval_usecase.go`, usado nesta rodada só pelo call site de `ExecuteApprovedAction` (os
    outros 5 call sites de `recordAudit`, os eventos do próprio ciclo de vida da aprovação —
    requested/approved/rejected/withdrawn/system_toggled — continuavam sem `application_id` de
    propósito nesta primeira correção; isso mudou no terceiro bug abaixo).
  - **Segundo bug real, mesma causa raiz, achado ao comparar a jornada completa de História com a
    Activity de uma aplicação criada via aprovação** ("está faltando toda uma jornada que deveria
    estar sendo apresentado no activity"): mesmo depois da correção acima, uma aplicação CRIADA via
    aprovação nunca mostrava nem seu PRÓPRIO evento de criação na própria Activity tab.
    `request.ApplicationID` é nil pra `application_create` (a aplicação não existe no momento do
    PEDIDO — só fica preenchido numa EDIÇÃO, ver `isApplicationEdit`), e `ExecuteApprovedAction`
    usava esse nil direto, mesmo depois de `executeApplicationCreateAction` já ter criado a
    aplicação e conhecer seu ID de verdade. Corrigido fazendo `executeApplicationCreateAction`
    devolver `(string, error)` (o ID novo) e `ExecuteApprovedAction` usar esse retorno — não
    `request.ApplicationID` — como `applicationID` do evento de execução, só pro branch de criação
    de verdade (edição continua usando `request.ApplicationID`, que já vem preenchido). Os eventos
    `approval_requested`/`approval_approved` de uma criação de aplicação continuam sem
    `application_id` de propósito (aconteceram ANTES de ela existir, não têm como referenciá-la) —
    só o evento de execução (`application_created`) se beneficia.
  - **Terceiro bug real, mesma causa raiz, reportado em uso ao vivo depois das duas correções
    acima**: comparando a jornada completa de um toggle criado via aprovação em History (3 linhas:
    "Requested: Create toggle" → "Approved Create toggle request" → "Created toggle... (after
    approval)") com a Activity da mesma aplicação (só 1 linha, a criação) — "deveria ter o pedido,
    a aprovação e a criação, só tem a criação listada". Ao contrário de uma criação de aplicação
    (2º bug acima), pra um toggle/regra/chave/edição/exclusão sobre uma aplicação QUE JÁ EXISTE,
    `request.ApplicationID` já é conhecido desde o momento do PEDIDO — só nunca tinha sido
    repassado aos eventos `approval_requested`/`approval_approved`/`approval_rejected`/
    `approval_withdrawn` (que sempre chamavam `recordAudit`, sem `application_id`, por decisão
    deliberada da 1ª correção: "são eventos do próprio ciclo de vida da aprovação, não a atividade
    de uma aplicação" — decisão que o usuário reverteu explicitamente aqui). Corrigido trocando os
    4 call sites de `recordAudit` por `recordAuditWithApplication(..., request.ApplicationID, ...)`
    diretamente; `recordAudit` ficou com um único chamador (`approval_system_toggled`, que não tem
    aplicação nem time nenhum envolvido) e foi removido, inlinado nesse chamador. Resultado: a
    Activity de uma aplicação agora mostra a jornada completa de qualquer ação sobre ela que passou
    por aprovação, não só o passo final — a única exceção continua sendo `application_create`
    (2º bug), onde os dois primeiros passos genuinamente não têm uma aplicação pra referenciar
    ainda.
  - Coberto por testes reais em toda camada (repositório real via SQLite, usecase com mocks,
    handler via integração real end-to-end — incluindo
    `TestAuditIntegration_ApprovalFlow_ApplicationCreate_ExecutionEventCarriesNewApplicationID`
    (2º bug: aprova+executa de ponta a ponta, confirma `application_id` na linha gravada e a
    aplicação recém-criada vendo seu próprio evento em `GET .../audit`) e as novas asserções em
    `TestAuditIntegration_ApprovalFlow_RecordsRequesterAndExecutionEvents` (3º bug: confirma
    `application_id` em `approval_requested`/`approval_approved` e que a Activity da aplicação
    lista os 3 event_types da jornada) — componentes/telas via Testing Library) e 5 e2e
    (`history-and-activity.spec.ts`): filtro por ator narrows corretamente entre dois atores
    reais, Export CSV baixa um arquivo de verdade com cabeçalho+linha esperada
    (`page.waitForEvent("download")`), a Activity tab de uma aplicação
    mostra só os eventos daquela aplicação (acessível como admin, não só root), — regressão do
    2º bug — uma aplicação criada via workflow de aprovação completo mostra seu próprio evento de
    criação na própria Activity tab, e — regressão do 1º e 3º bugs juntos — um toggle criado via
    workflow de aprovação completo (intercept → pending → aprovado por root) mostra a jornada
    completa requested→approved→created na Activity tab da aplicação, não só o passo final.
- ✅ **User Management** (`/users`, `screens/UserManagementScreen.tsx`, root ou admin) —
  **reconstruído do zero** depois que o protótipo (`docs/toToggle v2.1.html`) ganhou uma tela
  real de usuários que não existia na versão anterior (`UsersView`/`UserModal`/
  `TempPasswordModal`/`StatusPill`/`UserRow` em `users.jsx`, decodificado do bundle comprimido —
  ver o aviso grande no topo da seção "Frontend"). Rota client-side mudou de `/user-management`
  pra `/users`: seguro desde a migração de toda a API pra `/api` (antes esse path colidia com o
  prefixo real da API de usuários).
  - **Item de nav "Usuários" confirmado** (ícone `user`, `canManageUsers = role root || admin`,
    entre "Teams & people" e "Approvals") — trazido de volta ao `AppShell` depois de ter sido
    removido numa fase anterior por não ter respaldo nenhum no protótipo na época.
  - **Criação passou a exigir time e suporta aprovador desde o início**: `UserModal` tem campo
    Time (root escolhe qualquer time; admin só os seus, via `listTeamOptions` já existente) e um
    switch "Aprovador do time" visível só quando root está criando um admin. O backend
    (`POST /api/users`) ganhou `team_id` (obrigatório — associa o usuário ao time na mesma
    chamada, não é mais um passo separado) e `is_approver` (reforçado no servidor: só tem efeito
    quando quem chama é root criando um admin, mesmo que o client mande diferente).
  - **`canManageUser` — nova regra de autorização, portada 1:1 do protótipo real**: root
    gerencia qualquer usuário (exceto root/si mesmo); admin gerencia qualquer usuário que
    compartilhe pelo menos um time consigo, **inclusive outro admin**, exceto root/si mesmo;
    `user` não gerencia ninguém. Isso agora governa `GET /api/users` (lista filtrada pra admin:
    só quem compartilha time + a própria conta), `POST /api/users/:id/reset-password` (novo) e
    `PUT /api/users/:id/status` (novo). **Deliberadamente NÃO estendido a `DELETE
    /api/users/:id`** nesta passada — excluir continua root-only; ampliar pro mesmo escopo de
    `canManageUser` fica pra uma iteração futura (registrado aqui pra não se perder).
  - **`status` é um campo derivado, nunca armazenado direto** (`entity.User.RefreshStatus`,
    chamado via hook `AfterFind` do GORM em toda leitura): `"disabled"` (tem prioridade) quando
    `active=false`; `"pending_first_login"` quando `must_change_password=true`; `"active"` caso
    contrário. Só uma coluna nova de verdade foi adicionada (`active BOOLEAN DEFAULT TRUE`,
    migration `20260824000000_add_user_active_column.sql`) — `pending_first_login` reaproveita o
    `must_change_password` que já existia, sem duplicar estado.
  - **`POST /api/users/:id/reset-password`** (novo): gera uma senha provisória nova e invalida a
    anterior. **`PUT /api/users/:id/status`** (novo): `{active: bool}`, desativa/reativa sem
    apagar a conta. Confirmado ao vivo (root cria admin escopado a um time com aprovador=true →
    `GET /teams/:id/approvers` reflete a associação; admin lista só a si mesmo + colega de time;
    admin cria dentro do próprio time e recebe `403` fora dele; admin reseta senha de colega mas
    recebe `403` tentando mexer em alguém de outro time ou em si mesmo; `DELETE` continua
    recusando pra admin com `403` "Root privileges required").
  - **Duas divergências forçadas pelo modelo de dados real** (não por escolha): o protótipo tem
    "Nome completo" (separado do username, vira slug); `entity.User` só tem `Username`, sem campo
    de nome de exibição — a tela só pede username. O protótipo tem um botão "Ver senha" pra reler
    a senha já mostrada enquanto `pending_first_login` — só é possível lá porque é estado em
    memória; com bcrypt uma senha já exibida nunca pode ser lida de novo, então só existe
    "Resetar senha" (gera uma nova, sempre).
  - **A troca de role por `<select>` (existente antes) foi removida do `UserRow`** — o `UserRow`
    confirmado do protótipo não tem esse controle (só `RoleBadge` somente-leitura); o endpoint
    `PUT /api/users/:id` continua existindo e funcionando, só não tem mais um ponto de entrada na
    UI. Registrado como capacidade perdida na tela, não no backend.
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
  `get_component_spec("MemberRow")` (JSX confirmado com o switch de aprovador de verdade). **Fase
  6 (fidelity pass) corrigiu uma afirmação falsa deste próprio bullet**: dizia ter confirmado o
  texto literal "Aprovador"/"Designar como aprovador"/"Remover como aprovador" (português), mas
  `get_component_spec("MemberRow")` na verdade sempre mostrou "Approver"/"Make approver"/"Remove
  as approver" (inglês) em `## Textos` — o componente tinha ficado em português por engano numa
  sessão anterior que nunca cruzou essa afirmação com a fonte real antes de escrevê-la aqui.
  Corrigido (código + testes) pro texto real confirmado. **Troca de role
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
- ✅ **v2.6 §8 — Phase 6 (polish pass final)**: fecha o plano de paridade v2.6. Três frentes:
  - **§8.2 empty states**: `ApplicationsScreen`'s "ed" (descrição do estado vazio) dizia "Create
    your first application to get started." — `get_full_jsx("AppList")` (alcançável direto,
    apesar de a árvore autenticada de `App` ser um buraco conhecido do design-graph — vale sempre
    tentar antes de assumir que não dá) confirma "Create one to start managing its toggles.".
    Corrigido (TDD: teste vermelho com o texto confirmado, depois o fix).
  - **§8.4 mobile**: `.bulk-bar` (seleção múltipla, v2.6 §6.5) e `.cmdk-scrim`/`.cmdk-box`
    (command palette, v2.6 §6.1/6.2) nunca tinham ganhado um breakpoint — a barra de bulk-select
    (label + 2 botões numa linha só, sem wrap) transbordava horizontalmente em telas estreitas,
    e o palette perdia espaço vertical demais com `padding-top: 12vh` fixo. Adicionado ao bloco
    `@media (max-width: 600px)` já existente em `styles/global.css`: `.bulk-bar` ganha
    `flex-wrap: wrap` (label empurrado pra linha própria via `flex: 1 1 100%`, mesmo padrão já
    usado por `.tree-toolbar .search`), `.cmdk-scrim`/`.cmdk-box` ganham padding/max-height
    ajustados pro viewport pequeno.
  - **Fidelity pass — achado real e maior que o esperado**: comparando telas inteiras contra
    `get_full_jsx`/`get_screen_full`/`get_component_spec`, uma quantidade grande de texto
    confirmado (inglês) tinha ficado em português por engano em sessões anteriores que nunca de
    fato cruzaram a implementação com a fonte antes de declarar "confirmado" — incluindo, num
    caso (`MemberRow`), uma afirmação **falsa** de que o português tinha sido confirmado (ver
    bullet "Designação de aprovadores por time" acima). Corrigido em: `ApprovalSettingsPanel.tsx`
    ("Sistema de aprovação"→"Approval system", "Ações que exigem aprovação"→"Actions that require
    approval", textos de sistema ativo/desativado, badge "N ativa(s)"→"N active"),
    `ApprovalsScreen.tsx` (page-desc, banner "Sistema ativo/desativado · N ações
    configuradas"→"System active/disabled · N configured actions", botão "Configurar"→"Configure",
    empty states "Tudo limpo"/"Nenhum registro"→"All clear"/"No records"), `UserModal.tsx`
    (título/sub/labels/hints/botões inteiros — "Criar usuário"→"Create user", "Nome
    completo"→"Full name", "Time"→"Team", "Papel"→"Role", "Aprovador do time"→"Team approver",
    etc.), `UserManagementScreen.tsx` (page-title "Usuários"→"Users", page-desc, busca "Buscar por
    nome ou username"→"Search by name or username" — um comentário de teste citava esse
    placeholder errado como "confirmado", nunca tinha sido checado de verdade —, badges,
    "Nenhum usuário encontrado."→"No users found."), `UserRow.tsx` ("você"→"you", "Resetar
    senha"→"Reset password", "Reativar"/"Desativar"→"Reactivate"/"Disable", "Excluir
    usuário"→"Delete user", separador/fallback de times "," /"—"→" · "/"Unassigned"),
    `MemberRow.tsx` ("Aprovador"/switch titles), `TempPasswordModal.tsx` (título/sub/labels/botão
    inteiros, incluindo a caixa de ack — que não existe no protótipo, endurecimento deliberado já
    presente em `GeneratedKeyModal` — só teve o texto traduzido pro mesmo tom em inglês),
    `TeamsScreen.tsx` (empty state "Nenhum time ainda."→"No teams yet."). Mensagens de
    validação/erro (formulário e catch de submit) foram deliberadamente **mantidas em português**
    em todo lugar — convenção já estabelecida no resto do app (estado transitório, não cópia
    confirmada do protótipo), distinta de rótulo/título/botão estático. Toda a suíte de testes
    (unit + e2e, ~10 arquivos de spec) foi atualizada junto — nenhuma asserção continua checando o
    texto antigo em português.
  - **Gap real encontrado mas fora de escopo desta rodada** (feature ausente, não cópia errada):
    o pequeno badge "⚠ no approver" ao lado da contagem de membros no `TeamsScreen` (planejado no
    §2.10 original, Phase 1) nunca foi construído — só o aviso equivalente na tela de Approvals
    existe. Precisaria de um campo novo (`GET /teams` não devolve se um time tem aprovador
    designado hoje), então fica documentado aqui como pendência real, não corrigido nesta rodada
    de polish.
  - **Rodada extra, depois que o design-graph em si foi corrigido** (ver
    `docs/investigation/design-graph-unreachable-components.md` — dossiê escrito nesta mesma
    sessão pedindo pra outro agente investigar; o usuário confirmou o conserto e pediu pra
    reverificar tudo que antes era inacessível): `CommandPalette`, `TogglePaths`, `OnboardingModal`,
    `ToggleCard`, `SuggestChangeModal` e `ActivityView` — os 6 componentes que antes só
    `get_full_jsx` recusava com "JSX completo não disponível" — agora extraem normalmente.
    Recomparados um a um contra o que já existia:
    - `CommandPalette.tsx`, `TogglePaths.tsx`, `SuggestChangeModal.tsx`, `OnboardingModal.tsx`: já
      batiam 1:1 com o confirmado (construídos corretamente na época via decode do bundle, antes
      da diretiva atual de só usar design-graph) — nenhuma mudança de texto/estrutura necessária.
    - `ToggleCard.tsx`: um `title="Somente leitura"` (português) sobrou onde o confirmado diz
      `title="Read-only"` — corrigido.
    - **`ActivityView` — gap real e maior**: o confirmado mostra `<AuditChips>` (filtro de
      categoria) + um `<AuditToolbar>` sem ator (filtro de intervalo + Export CSV) + `<AuditFeed>`;
      a Activity tab desta reescrita era só um `<AuditFeed>` puro, sem filtro nenhum — nunca dava
      pra saber que esses dois faltavam enquanto o componente ficava fora do alcance da
      ferramenta. Corrigido de ponta a ponta:
      - **Backend**: `AuditUseCase.ListForApplication` ganhou o mesmo `AuditListOptions` de `List`
        (categoria + intervalo; nunca ator, de propósito — a Activity real nunca teve um `<select>`
        de ator). O repositório já suportava combinar `ApplicationID` com `Category`/`CreatedAfter`
        desde a Fase 5 (nenhuma mudança lá) — só faltava o usecase/handler repassarem os
        parâmetros. `GET /applications/:id/audit` ganhou `?category=`/`?range=` (mesma validação
        de categoria de `GetAuditLog`, extraída pra `parseAuditCategory` — evita duplicar o
        `switch` nos dois handlers).
      - **Frontend**: `components/AuditChips.tsx` (novo) extrai o que antes era JSX inline em
        `HistoryScreen` (agora reusado pelos dois lugares — `CATEGORY_TABS` também virou
        exportado de lá). `AuditToolbar` ganhou ator opcional (`onActorChange` como sinal de
        presença — só renderiza o `<select>` quando fornecido), pra poder ser reusado pela
        Activity tab sem ator nenhum. `ApplicationDetailScreen`'s aba Activity ganhou estado de
        categoria/intervalo/entries e monta `AuditChips` + `AuditToolbar` (sem ator) +
        `AuditFeed`, com `downloadCSV(entries, \`totoggle-${applicationName}-activity.csv\`)`
        (nome de arquivo confirmado literalmente no JSX real).
    - **`HistoryScreen` também ganhou dois ajustes confirmados só agora**: o page-desc
      ("An append-only audit trail...", uma aproximação razoável mas nunca confirmada) virou o
      texto real ("Administrative audit trail — accounts, teams, applications, service keys and
      the approval system."); e um `.scope-note` novo (ícone `shield` + "Root only. Changes to
      toggles live in each application's Activity tab.") que não existia — o texto "Root only..."
      já era conhecido de uma fase anterior, mas nunca como um elemento visível próprio, só como
      justificativa de uma decisão de acesso. `Icon.tsx` ganhou o glifo `shield` (o `d` exato do
      SVG não é exposto pela extração do design-graph — só o USO `<Icon name="shield"/>`, nunca o
      mapa `ICONS` em si — path de escudo padrão usado como aproximação razoável, mesmo estilo de
      traço do resto do arquivo).
    - Coberto por TDD em toda camada nova (usecase, handler de integração, componentes,
      `ApplicationDetailScreen`) e um novo e2e (`history-and-activity.spec.ts`) provando o filtro
      de categoria excluindo/reincluindo o toggle certo e o download do CSV com o nome de arquivo
      exato confirmado.
  - **Segunda rodada extra, depois de uma NOVA atualização do design-graph** (o usuário pediu uma
    varredura de ícones/fontes/imagens): duas tools novas ficaram disponíveis —
    `get_full_texts(name)` (lista de textos sem corte) e `get_component_data(name)` (conteúdo
    completo de qualquer constante em nível de módulo que o componente referencia — ex.: um mapa
    `ICONS[name] -> path`). `get_component_data("Icon")` devolveu o `ICONS` real inteiro do
    `icons.jsx` do protótipo — comparado 1:1 contra todo glifo já usado neste projeto:
    - ~30 ícones já batiam exatamente (incluindo `shield`, cujo path tinha sido uma aproximação
      Feather/Lucide padrão — coincidência feliz, o real é idêntico).
    - **2 gaps reais fechados**: `chevright` (`M9 18l6-6-6-6`, distinto de `chevdown`/
      `chevron-down`) e `code` (`M16 18l6-6-6-6M8 6l-6 6 6 6`) nunca tinham sido confirmados — o
      onboarding wizard usava duas substituições deliberadas documentadas no topo de
      `OnboardingSteps.tsx` ("settings" no lugar de "code" pro card "Integration", "chevron-down"
      rotacionado -90° no lugar de "chevright" em toda seta "→"). Ambas corrigidas pros glifos
      reais; a rotação CSS não era visualmente errada (girar um chevron pra baixo em -90° já dá um
      chevron pra direita), mas usar o path certo é mais correto que uma transformação por cima de
      outro glifo.
    - **Fontes**: `--font-sans`/`--font-mono` (`styles/tokens.css`) e o `<link>` do Google Fonts em
      `index.html` já batiam exatamente com os tokens confirmados (`font_sans`: "Space Grotesk",
      `font_mono`: "JetBrains Mono") — nenhuma mudança necessária.
    - **Imagens**: o protótipo `toToggle` não tem nenhum asset de imagem/logo/ilustração (busca
      confirmou — só a classe `.avatar`, iniciais de texto, já implementada em toda parte via
      `lib/userDisplay.ts#initialsOf`) — nada a ajustar.
    - Achado adicional sobre a própria ferramenta (não sobre este código): `get_full_texts`/
      `get_component_data` resolvem o componente ERRADO quando o nome pedido é prefixo de outro
      nome existente (`name="App"` resolveu pra `AppStep`) — documentado em
      `docs/investigation/design-graph-findings.md` (Achado 6, novo) junto com a confirmação de
      que os Achados 1 e 2 desse mesmo documento foram resolvidos por essas atualizações.
  - **Terceira rodada extra, depois de uma TERCEIRA atualização do design-graph** (o usuário
    reportou "tinha partes faltando como respostas" e pediu nova análise): `App` passou a
    aparecer em `list_screens()` pela primeira vez desde sempre (24 componentes, 7 seções —
    Sidebar/Topbar/Page/Confirm app row/Skey warn ×2/Toast), e `get_section(screen="App", ...)`
    passou a devolver dados reais em vez de "Seção não encontrada" — resolvendo de vez o Achado 3
    de `docs/investigation/design-graph-findings.md` (atualizado nesta mesma rodada). Usado pra
    reconferir a sidebar/topbar/page-desc reais e achar gaps concretos:
    - **Botão de nav "Search ⌘K" faltando**: o app só tinha o atalho de teclado (⌘K/Ctrl+K) pro
      command palette, sem nenhuma affordance clicável persistente pra descobri-lo/acioná-lo — a
      seção Sidebar real confirma um item de nav próprio (ícone `search` + label "Search" +
      `<span className="count">⌘K</span>`, mesmo padrão visual dos contadores de badge).
      Adicionado a `AppShell.tsx`, dentro do `<aside>` (já tem `className="nav-item"`, então o
      fechamento automático do menu mobile em qualquer clique de `.nav-item` funciona de graça).
    - **Branch de page-desc da aba Activity faltando**: o ternário de `ApplicationDetailScreen.tsx`
      só tinha 2 branches (`toggles` / senão-keys) — abrir a aba Activity mostrava por engano o
      texto da Service key. A seção "Page" real do `App` confirma um 3º branch condicional
      (`tab === "history"` na nomenclatura do protótipo, mapeado aqui pra `tab === "activity"`):
      "Everything that happened in this application — toggles created and removed, switches,
      activation rules and approvals." Corrigido.
    - **`RejectApprovalModal.tsx` e `ApprovalRow.tsx` inteiramente em português, com uma alegação
      FALSA de que já tinham sido confirmados em inglês** (mesma classe de erro do bullet
      "Designação de aprovadores por time" acima, sobre `MemberRow.tsx`) — achado investigando o
      componente `RejectModal` (agora extraível via `get_full_jsx`, antes um dos 6 componentes
      bloqueados documentados em `docs/investigation/design-graph-unreachable-components.md`).
      Confirmado e corrigido: `RejectApprovalModal` ganhou de volta a linha "Action" que faltava
      inteiramente (o confirmado tem 3 linhas de resumo — Action/Requested by/Target; a
      implementação só tinha 2), título/sub/botões/labels traduzidos ("Reject request"/"The action
      will not run"/"Cancel"/"Confirm rejection"/"Requested by"/"Target"/"Rejection reason
      (optional)"). `ApprovalRow` teve os botões "Reject"/"Approve" e o `StatusChip`
      ("Approved"/"Rejected"/"Pending"/"Expired") corrigidos do mesmo jeito, com o comentário do
      `StatusChip` reescrito pra explicitar o erro anterior e não deixá-lo se repetir. Todos os
      testes de componente e ~10 specs e2e (`grep`+`sed` em massa, mais correções manuais onde o
      padrão de string variava) atualizados junto.
    - **`AddMemberModal.tsx` comparado contra o `MemberModal` real**: o `sub` estava reduzido
      demais (`` `Invite someone to ${teamName}` ``) — o confirmado é bem mais explicativo:
      "Team members must have an account — pick one (people can belong to more than one team) or
      create a new one for {teamName}". O rótulo do botão de submit também divergia: "Add member"
      (confirmado é "Add to team" — o modal continua se chamando "Add member" no título, só o
      texto do BOTÃO mudou) e a dica de "nenhum candidato" estava sintetizada em português
      ("Todos os usuários já são membros deste time.") onde o confirmado, pro estado análogo
      (`candidateUsers.length === 0`), diz "No other accounts to add right now." Os três
      corrigidos; o botão que ABRE o modal (em `TeamMembersSection.tsx`) continua dizendo "Add
      member" de propósito — ele reflete o título do modal, não o texto do botão de submit
      interno, então não muda.
    - **Demais componentes de `App` reconferidos sem gap**: `UserMenu.tsx` (já batia — "Change
      password"/"Sign out", omissão documentada do nome do time por custo de uma chamada extra),
      `ChangePasswordForm.tsx` (já confirmado numa fase anterior, sem mudança), `ConfirmModal.tsx`
      (label padrão "Confirm" já correto), `CreateTeamModal.tsx` (já batia com `TeamModal`).

### Status v2.6 — pendências reais conhecidas (última auditoria: 2026-09-07)

O plano v2.6 está **substancialmente completo** (Phases 1–6, ver histórico acima) e persistência
de favoritos foi adicionada além do escopo original a pedido do usuário. Os itens abaixo são os
únicos gaps REAIS ainda abertos, encontrados numa auditoria de status que também corrigiu duas
divergências de documentação (texto desatualizado dizendo que o onboarding não existia — existe
desde §6.7-6.9 — e um bug real de tradução, o nav item "Users" que tinha ficado "Usuários"):

1. ✅ **RESOLVIDO (2026-09-07)** — Estrutura de abas de `ApprovalsScreen` por papel. Root agora vê
   Pending/History/Settings (sem "Mine"); não-root vê Pending-ou-Approvable/Mine (sem Settings/
   History), confirmado contra `get_full_jsx("App")`/`get_screen_full("ApprovalsView")` (o
   ternário real do empty state, `tab === "pending" ? "check" : tab === "mine" ? "user" :
   "history"`, prova que existe um 3º valor de tab fora de pending/mine, e que ele usa o ícone
   "history"). A aba "History" reusa `GET /approval/requests` (`api/approvals.ts#listAllApprovals`)
   — endpoint que já existia no backend E no frontend, mas estava **morto** (zero chamadores reais,
   só os próprios testes) desde que o `/history` global migrou pro sistema de audit log genérico;
   revivido em vez de recriado, sem nenhuma mudança de backend necessária. `ApprovalsScreen`
   filtra `status !== "pending"` no cliente, mesma lógica do `ApprovalsView` real. TDD: 3 testes
   novos + 2 reescritos (os que testavam "Mine" como root migraram pra admin, já que root perdeu
   essa aba) em `ApprovalsScreen.test.tsx`; e2e (`approval-reject.spec.ts`) estendido pra provar
   que root vê o item rejeitado em "History" (não em "Mine", que nem existe pra root) e que
   admin nunca vê "History".
2. ✅ **INVALIDADO (2026-09-07)** — não era um gap real. `get_full_jsx("TeamsView")` (fetch fresco
   nesta rodada) confirma que o real `TeamsView` **não tem nenhum estado vazio pra "zero times"**
   — é só `teams.map(...)` puro, sem checagem de `.length === 0` em lugar nenhum antes disso. A
   suposição anterior (de que devia existir uma estrutura `.empty` com ícone+título+descrição, só
   porque Applications/Approvals têm) nunca tinha sido checada contra a fonte real. O texto solto
   "No teams yet." que já existia é, na prática, MAIS fiel ao confirmado do que a estrutura
   elaborada teria sido — nenhuma mudança de código feita.
3. ✅ **RESOLVIDO (2026-09-07)** — badge "⚠ no approver" no `TeamsScreen`/`TeamMembersSection`.
   A suposição de que precisaria de um campo novo em `GET /teams` também estava errada:
   `get_full_jsx("TeamsView")` confirma que `approverCount` é computado no CLIENTE a partir da
   própria lista de membros já carregada (`rows.filter(r => r.m.isApprover).length`) — dado que
   `TeamMembersSection` já busca via `GET /teams/:id/approvers` desde sempre. Badge adicionado ao
   header de `TeamMembersSection` (não ao de `TeamRow`, que é um componente irmão sem acesso a essa
   lista — a estrutura já dividida em dois componentes, pré-existente, foi respeitada em vez de
   fundida). Mesmo fetch que já corrigiu isso revelou mais um gap real, também corrigido: a
   page-desc de `TeamsScreen` estava faltando a segunda frase confirmada, só pra root (`{isRoot &&
   <span style={{color:"var(--accent)"}}> Only root can assign per-team approvers.</span>}`). TDD:
   5 testes novos (`TeamMembersSection.test.tsx` ×3, `TeamsScreen.test.tsx` ×2); e2e
   (`teams-and-users.spec.ts`) estendido pra provar o badge aparecendo num time recém-criado sem
   membros, continuando visível com um membro não-aprovador, e sumindo assim que o 1º aprovador é
   designado.
4. **`EditToggleDrawer`/`CreateToggleModal`/`StatusRing` nunca foram auditados contra o
   design-graph** (JSX real nunca comparado lado a lado, diferente de todo o resto da tela de
   detalhe de aplicação, já confirmado). Candidatos naturais a uma próxima varredura.
5. **`PUT /applications/:id` classificado como `application_create` pelo middleware de aprovação**
   (não existe uma constante `application_update` própria) — pré-existente ao frontend, afeta só
   o approval workflow quando alguém edita (não cria) uma aplicação com aprovação ligada para
   `application_create`.
6. **Achado sobre o próprio design-graph, não uma pendência deste código**: `get_full_texts`/
   `get_component_data` ainda resolvem o componente errado quando o nome pedido é prefixo de
   outro (Achado 6, `docs/investigation/design-graph-findings.md`) — sem solução possível deste
   lado, é bug da ferramenta.

Nenhum destes é um bloqueador — todos são cosméticos, de escopo pequeno e bem isolado, ou fora do
alcance deste código (o Achado 6). Peça pra atacar qualquer um deles quando fizer sentido.

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