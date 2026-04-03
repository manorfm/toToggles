---
name: clean-architecture-go
description: Padrões arquiteturais, boas práticas e stack técnica para o projeto toToogle (Go + Gin + Gorm)
frameworks:
  - gin
skills:
  - clean-architecture
  - restful-api
  - logging
  - error-handling
  - validation
  - dependency-injection
  - orm-gorm
  - db-sqlite
  - ulid-generation
  - bcrypt-hashing
  - middleware-patterns
  - unit-testing
best_practices:
  linting: true
  testing: true
  project_structure: standard-go
  id_pattern: ulid
  auth_pattern: basic
---

# Clean Architecture Go Backend

Esta skill foi criada para instruir a inteligência artificial a sempre seguir a arquitetura definida no projeto `toToogle`.

## Regras e Padrões Principais

1. **Geração de ID (ULID):**
   - Sempre use `generateULID()` para gerar IDs.
   - Os IDs devem ser gerados no hook `BeforeCreate` do GORM da Entidade.

2. **Arquitetura (Clean Architecture):**
   - Siga rigorosamente as camadas: `Entity` -> `Repository Interface` -> `Database (Gorm)` -> `Usecase` -> `Handler` -> `Router`.

3. **Injeção de Dependências:**
   - Injete repositórios nos usecases, e usecases nos handlers através de funções `New...` (ex: `NewUserUsecase(repo)`). Não utilize variáveis globais.

4. **Testes Unitários:**
   - Adicione testes unitários para a lógica de negócio principal nas camadas de `usecase` e `handler` utilizando a biblioteca `testify/assert`.

5. **ORM e DB:**
   - Utilize as tags mapeadas do `gorm` na struct da entidade. O banco de dados suportado no momento é o `sqlite`.
