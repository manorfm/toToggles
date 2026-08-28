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
  boot — idempotente (só aplica o que falta), então não conflita com quem ainda roda
  `make migrate-up` manualmente no fluxo de dev local. O `Dockerfile` builder stage precisou
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
> qualquer tela, veja o harness em `../CLAUDE.md` e siga a skill `design-graph-frontend` (consultar
> o MCP `design-graph` como fonte de verdade do novo design — nunca reaproveitar padrões do frontend
> antigo, que não existe mais nem deveria servir de referência).

> ⚠️ **design-graph tem um buraco grande e conhecido: a árvore JSX autenticada do componente
> `App` nunca é indexada.** `get_full_jsx`/`get_component_spec`/`get_screen_full` para `App`
> sempre devolvem só o branch de login (`<LoginScreen onLogin={login} />`) — o `return` real,
> depois de `if (!authed) return <LoginScreen .../>`, nunca é capturado. Isso já causou várias
> reconstruções erradas nesta reescrita (sidebar sem ícone/contador, topbar inexistente, perfil
> sem avatar/role, e — mais grave — a lógica de status verde/âmbar/vermelho de
> `lib/toggleLeaves.ts` estava semanticamente errada até ser corrigida). **Existe uma fonte de
> verdade melhor**: `docs/toToggle.html` não é só HTML/CSS — embute um bundle comprimido com o
> JSX-fonte REAL, legível, de cada componente. Antes de reconstruir qualquer tela pela lógica
> "design-graph não achou, então invento a partir do screenshot", tente decodificar o bundle
> primeiro:
> ```python
> import re, json, base64, gzip
> html = open('docs/toToggle.html', encoding='utf-8').read()
> manifest = json.loads(re.search(r'<script type="__bundler/manifest">(.*?)</script>', html, re.S).group(1))
> for uuid, entry in manifest.items():
>     raw = base64.b64decode(entry['data'])
>     if entry.get('compressed'): raw = gzip.decompress(raw)
>     open(f'/tmp/toToggle-proto/{uuid}.{"js" if "javascript" in entry["mime"] else "txt"}', 'w').write(raw.decode('utf-8', 'replace'))
> ```
> Isso produz ~21 arquivos; a maioria (`react.js`/`react-dom.js`/Babel standalone) é vendor, ruído
> — os arquivos-fonte de verdade (grep por `AppCard`/`TeamsView`/`function App(` etc. pra achar
> os certos) são: `app.jsx` (App inteiro — sidebar/topbar/roteamento/estado/todo handler),
> `views.jsx` (AppList/AppCard/EditDrawer/KeysView/TeamsView/MemberRow/Approvals*/HistoryView),
> `paths.jsx` (StatusRing/ToggleCard/TogglePaths), `modals.jsx` (Modal/ConfirmModal/ServiceKeyModal/
> AppModal/NewToggleModal/MemberModal/TeamModal/ApprovalInterceptModal/RejectModal),
> `auth.jsx` (LoginScreen/ChangePasswordModal/UserMenu/RoleBadge), `onboarding.jsx`
> (OnboardingModal, 7 passos), `icons.jsx` (todo o set real de paths SVG — `ICONS`, mais confiável
> que os glifos "convenção, não originais" já documentados em `components/Icon.tsx`), `data.js`
> (mock data + `leafPaths`/`pathStatus`/`countTree`/`findNode`/`addPath`, as funções que
> `lib/toggleLeaves.ts` porta 1:1). Regras de CSS específicas (não confirmáveis por classe solta
> no `get_tokens`) ainda saem melhor via grep direto no HTML bruto (`.classe {` ou
> `.classe {\n` — o arquivo NÃO é minificado nos seletores CSS, só o JS é que fica comprimido no
> manifest), técnica já usada pra extrair `.app`/`.page`/`.topbar`/`.count`/`.user-chip` etc.
> Screenshots (`server/prototipo.png`/`atual.png`, quando o usuário os fornece) continuam válidos
> como conferência visual final, mas decodificar o bundle primeiro é estritamente melhor que
> reconstruir a partir de pixels — dá a lógica exata, não só a aparência.

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
      (`hooks/useSetOpenApp.ts`). Os dois itens de nav são **âncoras de scroll reais**
      (`document.getElementById("toggles-section"|"service-key-section")?.scrollIntoView(...)`),
      não um fake de estado de aba — nossa página empilha as duas seções (Toggles e Service key)
      numa página só, sem tabs de verdade pra imitar o `setTab("toggles"|"keys")` do protótipo.
      `hasSecretKey` vem de `SecretKeySection` via um novo callback opcional
      `onKeyPresenceChange?: (hasKey: boolean) => void` — mantém `SecretKeySection` como único
      dono do fetch de `GET /secret-keys` (não duplica a chamada em `ApplicationDetailScreen`).
      Também trouxe de volta pro `Icon.tsx` o path confirmado de `"layers"` (usado no item
      "Toggles" da sub-nav) e as regras `.nav-item svg { color: var(--ink-3) }`/`.nav-item.active
      svg { color: var(--accent) }`/`.key-active-dot` que também estavam faltando em
      `global.css`.
  - **Ainda deliberadamente fora de escopo** (confirmados no JSX real, não construídos): item de
    nav "Guia de início" (ícone `rocket`, abre `OnboardingModal` de 7 passos — feature inteira
    ainda não existe, adicionar o link seria clique morto); linha "Light mode" no rodapé (no
    protótipo é funcional de verdade, mas este app só suporta o tema escuro por decisão já
    documentada — replicar só visualmente seria UI morta pelo mesmo motivo). Ambos continuam
    visivelmente ausentes na comparação lado a lado com o protótipo — é uma divergência real e
    conhecida, não um erro de implementação; construí-los exigiria as features de verdade por
    trás (o wizard de onboarding, o suporte a tema claro), não só o item de menu.
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
    "AP"`) — antes era só a primeira letra do nome. Nome do time (`app.team`) e o terceiro stat
    "Key" continuam de fora: `GET /applications` não tem nem um nem outro; fechar esse gap exige
    uma query nova no backend (join com times/secret_keys), não é um ajuste de frontend.
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
- ✅ **History** (`/history`, `screens/HistoryScreen.tsx`) — o protótipo descreve "um audit trail de
  toda mudança do sistema", mas o backend **não tem** um log de auditoria genérico — a única trilha
  real é `GET /approval/requests` (qualquer status, qualquer role). Reaproveita `ApprovalRow` num
  modo `readOnly` (chip de status sempre, nunca botão de ação — e ganhou um chip "Pending" que
  faltava, antes qualquer status que não fosse approved/rejected virava "Expired" por engano).
  Ordena por `created_at` desc no client. Com isso, **todo item de nav do AppShell aponta pra uma
  tela real** — nenhum `NotMigratedScreen` sobrou, o componente foi removido (não tinha mais
  nenhuma rota apontando pra ele).
  - **Achado depois de decodificar o JSX real, NÃO corrigido ainda**: o `HistoryView` do protótipo
    é uma coisa BEM diferente do que foi construído aqui — um audit log rico, categorizado
    (`AUDIT_CAT`/`AUDIT_ICON`/`AUDIT_DOT` em `data.js`: toggles/keys/access/approvals, cada
    entrada com ícone+dot colorido próprio, texto HTML inline tipo "Disabled **experiments**
    branch", timeline com trilho vertical), filtrável por categoria — nada a ver com reaproveitar
    `ApprovalRow` em modo leitura (que é, na prática, o mesmo dado da aba "Histórico" de
    Approvals, não um audit log de verdade). Fechar esse gap de verdade exigiria um audit log
    genérico no backend (o comentário original desta tela já dizia isso — "o backend não tem um
    log de auditoria genérico" — mas a extensão real do gap só ficou clara depois de ver o
    `HistoryView` de verdade, que é muito mais rico do que o texto do protótipo sugeria).
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