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

### Rotas de Autenticação (Públicas)
- `POST /auth/login` - Login do usuário
- `POST /auth/logout` - Logout do usuário
- `POST /auth/change-password` - Alteração de senha

### Rotas de Usuários (Root Only)
- `POST /users` - Criar usuário
- `GET /users` - Listar usuários
- `PUT /users/:id` - Atualizar usuário
- `DELETE /users/:id` - Remover usuário

### Rotas de Times (Protegidas)
- `POST /teams` - Criar time
- `GET /teams` - Listar times
- `PUT /teams/:id` - Atualizar time
- `DELETE /teams/:id` - Remover time
- `POST /teams/:id/users` - Adicionar usuário ao time
- `DELETE /teams/:id/users/:userId` - Remover usuário do time

### Rotas de Aplicações (Protegidas)
- `POST /applications` - Criar aplicação
- `GET /applications` - Listar aplicações
- `PUT /applications/:id` - Atualizar aplicação
- `DELETE /applications/:id` - Remover aplicação

### Rotas de Toggles (Protegidas)
- `POST /applications/:id/toggles` - Criar toggle
- `GET /applications/:id/toggles` - Listar toggles (flat ou hierarchy)
- `PUT /applications/:id/toggles/:toggleId` - Atualizar toggle
- `DELETE /applications/:id/toggles/:toggleId` - Remover toggle
- `PUT /applications/:id/toggle/:toggleId` - Atualizar recursivamente

### API Pública (Secret Key)
- `GET /api/toggles` - Buscar toggles por secret key (Header: X-API-Key)

### Frontend (Protegido)
- `GET /` - Interface principal
- `GET /login` - Página de login
- `GET /change-password` - Página de alteração de senha
- `GET /static/*` - Assets estáticos

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

> ⚠️ **Em reescrita completa.** Este frontend (HTML/CSS/JS monolítico abaixo) está sendo
> substituído do zero a partir de um design system reformulado. Antes de tocar em qualquer tela,
> veja o harness em `../CLAUDE.md` e siga a skill `design-graph-frontend` (consultar o MCP
> `design-graph` como fonte de verdade do novo design).

### Stack Frontend
- **HTML5**: Estrutura semântica moderna
- **CSS3**: Estilos responsivos com custom properties
- **JavaScript Vanilla**: Sem frameworks, foco em performance
- **Fonts**: Inter (Google Fonts)
- **Icons**: SVG inline

### Páginas Principais
- `index.html` - Interface principal da aplicação
- `login.html` - Página de autenticação
- `change-password.html` - Alteração de senha
- `script.js` - Lógica da aplicação
- `login.js` - Lógica de autenticação
- `styles.css` - Estilos globais

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