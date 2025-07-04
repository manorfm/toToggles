APP_NAME = toToogle
DB_PATH = ./db/toggles.db
MIGRATIONS_DIR = ./db/migrations
GOOSE = goose

.PHONY: help run build test clean migrate-up migrate-down migrate-status docker-build docker-run

help: ## Mostra esta ajuda
	@echo "Comandos disponíveis:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

run: ## Roda a aplicação localmente
	go run main.go

build: ## Compila o binário
	go build -o $(APP_NAME) main.go

test: ## Executa os testes
	go test ./...

clean: ## Remove binário e banco de dados
	rm -f $(APP_NAME) $(DB_PATH)

migrate-up: ## Aplica todas as migrations
	$(GOOSE) -dir $(MIGRATIONS_DIR) sqlite3 $(DB_PATH) up

migrate-down: ## Desfaz a última migration
	$(GOOSE) -dir $(MIGRATIONS_DIR) sqlite3 $(DB_PATH) down

migrate-status: ## Mostra o status das migrations
	$(GOOSE) -dir $(MIGRATIONS_DIR) sqlite3 $(DB_PATH) status

docker-build: ## Constrói a imagem Docker
	docker build -t $(APP_NAME) .

docker-run: ## Roda o container Docker
	docker run -p 8081:8081 -v $(PWD)/db:/root/db $(APP_NAME)

dev: migrate-up run ## Roda em modo desenvolvimento (migrate + run) 