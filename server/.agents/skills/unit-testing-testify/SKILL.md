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
