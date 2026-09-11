# =============================================================================
# Build Stage - Compilação da aplicação Go
# =============================================================================
FROM golang:1.23-alpine AS builder

# Instalar dependências necessárias para build (inclui `file`, usado só pra verificação abaixo)
RUN apk add --no-cache git ca-certificates tzdata gcc musl-dev sqlite-dev file

# TARGETOS/TARGETARCH são preenchidos automaticamente pelo BuildKit (inclusive em `docker build`
# comum, sem buildx/--platform explícito — nesse caso default pro host) e casam com a imagem base
# golang:1.23-alpine já selecionada pra essa plataforma, então isso é compilação NATIVA (gcc local
# válido pro CGO), não cross-compile de verdade — corrige o build falhando em host arm64 com
# GOARCH=amd64 hardcoded. IMPORTANTE: nada de `=amd64`/`=linux` de default aqui — dar um valor
# default explícito faz o BuildKit usar esse literal em vez do valor real detectado da
# plataforma (confirmado ao vivo: só reproduziu o bug arm64 de novo com os defaults presentes).
ARG TARGETOS
ARG TARGETARCH

# Definir diretório de trabalho
WORKDIR /build

# Copiar arquivos de dependências primeiro (para aproveitar cache do Docker)
COPY go.mod go.sum ./

# Download de dependências (layer cacheável)
RUN go mod download && go mod verify

# Copiar apenas arquivos de código necessários
COPY main.go ./
COPY internal/ ./internal/
# db/migrations é compilado no binário via go:embed (internal/app/config/db.go) — não é só um
# asset estático copiado depois pro stage `assets`, precisa estar presente aqui pro `go build`.
COPY db/migrations/ ./db/migrations/

# Build otimizado da aplicação
RUN CGO_ENABLED=1 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o totoogle main.go

# Verificar se o binário foi criado corretamente
RUN ls -la totoogle && file totoogle

# =============================================================================
# Frontend Build Stage - Compilação do frontend (server/web) para static/app
# =============================================================================
# server/static/app/* NÃO fica commitado no git (é build output regenerável, ver
# .gitignore) — antes disso o Dockerfile dependia de alguém ter rodado `npm run build`
# manualmente e commitado o resultado. Agora o build acontece aqui, sempre a partir do
# código-fonte real (server/web/src), nunca de um bundle stale ou ausente.
FROM node:22-alpine AS frontend-builder

WORKDIR /web

# Copiar arquivos de dependências primeiro (para aproveitar cache do Docker)
COPY web/package.json web/package-lock.json ./
RUN npm ci

# Copiar o restante do código do frontend e buildar (vite.config.ts manda o output
# pra ../static/app, ou seja /static/app relativo a este WORKDIR)
COPY web/ ./
RUN npm run build

# =============================================================================
# Assets Stage - Preparação dos assets estáticos
# =============================================================================
FROM alpine:3.22 AS assets

WORKDIR /assets

# Copiar apenas os assets necessários
COPY static/ ./static/

# Sobrescreve com o bundle buildado nesta imagem (nunca do working tree local)
COPY --from=frontend-builder /static/app ./static/app

# Remover arquivos desnecessários se existirem
RUN find ./static -name "*.map" -delete 2>/dev/null || true && \
    find ./static -name "*.tmp" -delete 2>/dev/null || true && \
    mkdir -p ./db

# =============================================================================
# Production Stage - Imagem mínima de produção
# =============================================================================
FROM gcr.io/distroless/static-debian12:nonroot AS production

WORKDIR /app

# Copiar certificados CA e timezone data do builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copiar binário compilado e assets. O UID 65532 é o usuário `nonroot` da imagem distroless.
COPY --from=builder --chown=65532:65532 /build/totoogle /app/totoogle

# Copiar assets otimizados
COPY --from=assets --chown=65532:65532 /assets/static /app/static
# O binário inclui migrations via go:embed. Este diretório existe apenas para o SQLite persistir
# seu arquivo e precisa ser gravável pelo usuário não root.
COPY --from=assets --chown=65532:65532 /assets/db /app/db

# Definir timezone padrão
ENV TZ=UTC

# Porta real que o binário escuta (internal/app/router/router.go via config.ServerPort(),
# default 3056) — precisa bater com esse valor ou com o SERVER_PORT passado no `docker run`/
# docker-compose.yml, senão o mapeamento de porta do container não alcança nada.
ENV SERVER_PORT=3056
ENV DB_PATH=/app/db/toggles.db
EXPOSE 3056

# A imagem base já define esse usuário, mas a declaração deixa o contrato explícito.
USER 65532:65532

# Comando para executar a aplicação
ENTRYPOINT ["/app/totoogle"]
