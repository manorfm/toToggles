# =============================================================================
# Build Stage - Compilação da aplicação Go
# =============================================================================
FROM golang:1.23-alpine AS builder

# Instalar dependências necessárias para build
RUN apk add --no-cache git ca-certificates tzdata gcc musl-dev sqlite-dev

# Definir diretório de trabalho
WORKDIR /build

# Copiar arquivos de dependências primeiro (para aproveitar cache do Docker)
COPY go.mod go.sum ./

# Download de dependências (layer cacheável)
RUN go mod download && go mod verify

# Copiar apenas arquivos de código necessários
COPY main.go ./
COPY internal/ ./internal/

# Build otimizado da aplicação
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 \
    go build -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o totoogle main.go

# Verificar se o binário foi criado corretamente
RUN ls -la totoogle && file totoogle

# =============================================================================
# Assets Stage - Preparação dos assets estáticos
# =============================================================================
FROM alpine:latest AS assets

WORKDIR /assets

# Copiar apenas os assets necessários
COPY static/ ./static/
COPY db/migrations/ ./db/migrations/

# Remover arquivos desnecessários se existirem
RUN find ./static -name "*.map" -delete 2>/dev/null || true && \
    find ./static -name "*.tmp" -delete 2>/dev/null || true

# =============================================================================
# Production Stage - Imagem mínima de produção
# =============================================================================
FROM scratch AS production

# Copiar certificados CA e timezone data do builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copiar binário compilado
COPY --from=builder /build/totoogle /totoogle

# Copiar assets otimizados
COPY --from=assets /assets/static /static
COPY --from=assets /assets/db/migrations /db/migrations

# Definir timezone padrão
ENV TZ=UTC

# Expor porta da aplicação
EXPOSE 8081

# Definir usuário não-root (opcional, mas boa prática de segurança)
USER 65534:65534

# Comando para executar a aplicação
ENTRYPOINT ["/totoogle"]

# =============================================================================
# Alternative Production Stage - Com shell para debugging (comentado)
# =============================================================================
FROM alpine:latest AS production-debug

# Instalar apenas o mínimo necessário
RUN apk add --no-cache ca-certificates tzdata sqlite && \
    addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Definir diretório de trabalho
WORKDIR /app

# Copiar binário
COPY --from=builder /build/totoogle ./

# Copiar assets
COPY --from=assets /assets/static ./static
COPY --from=assets /assets/db/migrations ./db/migrations

# Criar diretório para banco de dados com permissões corretas
RUN mkdir -p ./db && \
    chown -R appuser:appgroup /app

# Mudar para usuário não-root
USER appuser:appgroup

# Expor porta
EXPOSE 8081

# Comando para executar
CMD ["./totoogle"] 