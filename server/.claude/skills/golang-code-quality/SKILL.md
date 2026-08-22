---
name: golang-code-quality
description: Idiomas e qualidade de código Go para o projeto ToToggle — error handling, complexidade, lint/vet, evitar abstração prematura
frameworks:
  - go
---

# Go Code Quality

Complementa `clean-architecture-go` (que define as camadas). Esta skill é sobre a qualidade do
código Go em si, dentro de qualquer camada.

## Error Handling

1. Nunca descarte um erro com `_`; trate-o ou propague-o.
2. Ao propagar com contexto adicional, use `fmt.Errorf("fazendo X: %w", err)` (`%w`, não `%v`) para
   preservar a cadeia e permitir `errors.Is`/`errors.As` no chamador.
3. Erros de negócio (validação, não encontrado) devem ser tipados/sentinela quando o handler
   precisa decidir o status HTTP a partir deles (ex.: `errors.Is(err, ErrNotFound)` → 404), em vez
   de comparar strings de mensagem.
4. Não use `panic`/`recover` para controle de fluxo em request handling — apenas para erros
   verdadeiramente irrecuperáveis na inicialização (ex.: falha ao abrir o banco em `config.Init()`).

## Simplicidade e abstração

5. Não crie interface para um tipo que só tem uma implementação real "para testabilidade" — a
   interface de repositório já existe para isso na camada de domínio; não duplique esse padrão em
   usecases/handlers sem necessidade concreta.
6. Prefira funções pequenas e pacotes coesos a hierarquias profundas de wrappers. Se remover uma
   camada de indireção não muda nenhum comportamento observável, remova-a.
7. Não adicione flags de feature/config para cenários hipotéticos — adicione quando o cenário
   existir de fato.

## Concorrência e contexto

8. Passe `context.Context` como primeiro parâmetro em funções que fazem I/O (chamadas ao GORM,
   HTTP), mesmo que hoje não seja usado para cancelamento — é o padrão idiomático e evita retrofit
   custoso depois.
9. Nunca inicie uma goroutine sem um caminho claro de término (canal de sinalização, `WaitGroup`,
   ou contexto cancelável). Vazamento de goroutine é bug, não detalhe de implementação.

## Nomenclatura e formatação

10. Siga `gofmt`/`goimports` sempre — o plugin `gopls-lsp` (habilitado no projeto) dá diagnósticos
    em tempo real; rode `gofmt -l .` antes de considerar uma tarefa pronta se o editor não formatou
    automaticamente.
11. Nomes de pacote curtos e sem `_underscore` ou `camelCase`; nomes de variável proporcionais ao
    escopo (`i` em loop curto é aceitável, campos de struct exportados precisam de nome completo).
12. Evite *stuttering*: `toggle.ToggleID` deveria ser `toggle.ID` dentro do pacote `entity`.

## Lint/verificação antes de finalizar uma tarefa

13. Rode `go vet ./...` e `go build ./...` antes de reportar uma alteração como concluída — pegam
    erros que `gofmt` não pega (assinaturas erradas de `Printf`, código morto óbvio, etc.).
14. Se o repositório ganhar um `.golangci.yml` no futuro, siga-o; até lá, `go vet` + `gofmt` são a
    barra mínima obrigatória, não opcional.
