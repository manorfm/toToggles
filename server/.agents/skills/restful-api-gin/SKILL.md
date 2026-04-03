---
name: restful-api-gin
description: Padrões de roteamento HTTP e Handlers com o framework Gin
frameworks:
  - gin
---

# RESTful API with Gin

Skill que dita como a camada HTTP deve ser configurada.

## Formato do Handler

1. **Uso de JSON:**
   - Todos os inputs (POST/PUT) devem ser feitos em JSON, consumidos utilizando `c.ShouldBindJSON` e todos os outputs devem retornar JSON usando `c.JSON`.

2. **Responses:**
   - Respostas de sucesso normalmente usam o formato: `{ "data": ... }`.
   - Respostas de erro normalmente usam o formato: `{ "error": "message" }`.

3. **Status Code:**
   - Retorne `http.StatusOK` ou `http.StatusCreated` (200/201) para sucesso.
   - `http.StatusBadRequest` (400) para erros de *parsing* e validação de `BindJSON/Validate()`.
   - `http.StatusNotFound` (404) quando um artefato que deveria existir não for encontrado, e `http.StatusInternalServerError` (500) para falhas imprevistas.

4. **Registro:**
   - Handlers devem pertencer ao pacote de handlers, depender via interface dos `Usecases` e ser exportados para injeção de dependência na função principal (`router.go`).
