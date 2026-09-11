FROM golang:1.26.5-alpine AS server-builder

WORKDIR /src

RUN apk add --no-cache ca-certificates gcc musl-dev sqlite-dev

COPY go.mod go.sum ./
RUN go mod download

COPY main.go ./
COPY internal ./internal
COPY db/migrations ./db/migrations

RUN CGO_ENABLED=1 go build -ldflags='-s -w -extldflags "-static"' -o /out/totoggle main.go


FROM node:22-alpine AS web-builder

WORKDIR /web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web ./
RUN npm run build


FROM alpine:3.22 AS runtime-files

RUN mkdir -p /app/data && chown 65532:65532 /app/data


FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

COPY --from=server-builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=server-builder --chown=65532:65532 /out/totoggle ./totoggle
COPY --chown=65532:65532 static ./static
COPY --from=web-builder --chown=65532:65532 /static/app ./static/app
COPY --from=runtime-files --chown=65532:65532 /app/data ./data

ENV SERVER_PORT=3056
ENV DB_PATH=/app/data/toggles.db

VOLUME ["/app/data"]

EXPOSE 3056

USER 65532:65532

ENTRYPOINT ["/app/totoggle"]
