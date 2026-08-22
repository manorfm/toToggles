---
name: security-go-web
description: Práticas de segurança para o backend Go do ToToggle — segredos, autenticação por sessão, secret keys de API, GORM e headers HTTP
frameworks:
  - gin
  - gorm
---

# Security — ToToggle Server

Práticas de segurança específicas deste projeto (auth por sessão + cookie, API pública via secret
key, SQLite via GORM). Aplique isto a qualquer código novo nas camadas `handler`, `middleware`,
`usecase` e `domain/auth`.

## Segredos e credenciais

1. Senhas: sempre `bcrypt` (já é o padrão em `domain/entity/user.go`) — nunca hash reversível ou
   texto plano, nunca logar a senha em nenhum nível de log.
2. Secret keys de API (`sk_...`): siga o padrão existente em `domain/entity/secret_key.go` —
   gerar com `crypto/rand` (nunca `math/rand`), armazenar apenas o hash SHA256, nunca a chave em
   texto plano no banco.
3. Ao comparar segredos/hashes fornecidos pelo usuário contra o valor armazenado, prefira
   `crypto/subtle.ConstantTimeCompare` a `==`/`bytes.Equal` para novo código sensível a timing —
   `bcrypt.CompareHashAndPassword` já faz isso internamente para senhas.
4. Nunca commitar segredos, tokens ou o arquivo `db/toggles.db` com dados reais. Nada de credenciais
   hardcoded em código ou em `docker-compose.yml`.

## Sessão e tokens

5. O token de sessão é uma string opaca (`token_<userID>`), resolvida apenas server-side — **não é
   um JWT verificável**, apesar do nome interno. Não trate como assinado nem decodifique claims
   dele; qualquer verificação de autorização deve recarregar o usuário do banco.
6. O cookie `auth_token` é `HttpOnly` + `SameSite=Strict`. Não relaxe `SameSite` nem exponha o
   token para JavaScript sem entender a consequência: isso é o que hoje impede CSRF entre origens
   — ver caveat completo em `docs/rest-flow.md`.
7. `ValidateToken()`/`RequireRoot()`/`RequireAdmin()`/`RequireApprovalAware()` em
   `internal/app/middleware/security.go` são a única fonte de verdade para autorização — nunca
   duplique a checagem de role manualmente dentro de um handler; adicione o middleware certo na
   rota.

## Entrada de dados e GORM

8. Sempre valide/faça bind com `c.ShouldBindJSON` + a validação de domínio (`Validate()` na
   entidade) antes de persistir — nunca confie em dado vindo do client.
9. Nunca construa SQL por concatenação de string; use os métodos do GORM (`Where("field = ?", v)`)
   ou filtros estruturados. Isso já é o padrão em `infrastructure/database/`.
10. IDs de path (`:id`) devem ser validados como ULID antes de usar em query — não repasse
    direto ao `Where` sem checagem de formato.

## Headers e transporte

11. `SecurityHeaders()` e `CORSHeaders()` em `middleware/security.go` já cobrem CSP, X-Frame-Options,
    nosniff, etc. — não remova nem enfraqueça esses headers ao adicionar rotas novas.
12. Se uma rota nova precisar de comportamento CORS diferente do padrão same-origin, trate como
    decisão explícita (não silenciosa) e documente o motivo em `docs/rest-flow.md`.

## Dependências

13. Ao adicionar uma dependência Go nova, prefira bibliotecas já usadas no `go.mod` (evite duplicar
    propósito, ex.: dois clientes HTTP diferentes). Rode `go mod tidy` e confira `go.sum` foi
    atualizado — nunca edite `go.sum` manualmente.
