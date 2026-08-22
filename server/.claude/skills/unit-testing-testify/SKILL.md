---
name: unit-testing-testify
description: Instruções de criação e estruturação de testes automatizados unitários em Go
frameworks:
  - testify
---

# Unit Testing in Go

Como aplicar testes na aplicação Go existente.

1. **Bibliotecas:**
   - Utilize o pacote de asserts do `testify` (`github.com/stretchr/testify/assert`) ao invés do pacote cru nativo para asserções mais legíveis.

2. **Nomenclatura:**
   - Coloque seus testes no arquivo adjunto ex: `toggle_usecase_test.go` para o arquivo `toggle_usecase.go`.

3. **Estrutura Table-Driven:**
   - Para métodos que possuem múltiplos caminhos (Sucesso vs. Falhas), organize usando *Table-Driven Tests* (`[]struct{name string, ...}`).
   - Sempre utilize *mocks* (`testify/mock`) para isolar camadas. Exemplo: Para testar um `Usecase`, instancie seu `Repository` como um struct tipo Mock para simular respostas do banco.

4. **Cobertura mínima:**
   - Toda função nova em `usecase/` e `handler/` precisa de pelo menos um teste de sucesso e um de
     falha (validação/erro de repositório) — não é aceitável adicionar lógica de negócio sem teste
     correspondente no mesmo commit.
   - Rode `go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out` antes de
     considerar uma tarefa concluída se a mudança tocou `usecase/`, `handler/` ou `domain/entity/`.

5. **Testes de integração de handler:**
   - Para fluxos que atravessam handler → usecase → repositório (ex.: criação de toggle com regra
     de ativação), prefira um teste usando `net/http/httptest` + `gorm.Open(sqlite.Open(":memory:"))`
     com as migrations aplicadas, em vez de mockar cada camada — GORM+SQLite in-memory já é rápido o
     suficiente para isso e pega bugs de mapeamento que um mock esconde.
   - Não abuse disso: lógica pura de validação/regra continua sendo teste unitário isolado (regra 3).

6. **Testes não devem ser flaky nem depender de ordem:**
   - Nunca dependa de estado deixado por outro teste (`db/toggles.db` real, contadores globais).
     Cada teste cria seu próprio banco in-memory ou mock isolado.
   - Nunca use `time.Sleep` para sincronizar; se há concorrência, sincronize via canal/`WaitGroup`.
