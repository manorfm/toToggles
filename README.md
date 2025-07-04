# ToToggle - Sistema de Feature Toggle

Sistema backend de feature toggle em Go, aplicando arquitetura hexagonal, clean architecture e boas práticas de clean code.

## Arquitetura

O sistema segue os princípios da Clean Architecture e Hexagonal Architecture:

- **Domain**: Entidades e regras de negócio
- **Use Cases**: Casos de uso da aplicação
- **Interfaces**: Contratos para repositórios e serviços
- **Infrastructure**: Implementações concretas (banco de dados, HTTP)
- **Application**: Configuração e inicialização

## Funcionalidades

### Aplicações
- Criar aplicação
- Listar aplicações
- Buscar aplicação por ID
- Atualizar aplicação
- Remover aplicação

### Feature Toggles
- Criar toggle com estrutura hierárquica
- Verificar status de toggle
- Atualizar toggle
- Remover toggle
- Listar toggles de uma aplicação
- Visualizar hierarquia de toggles

## Estrutura Hierárquica

Os toggles seguem uma estrutura hierárquica onde:
- Se um toggle pai está desabilitado, todos os filhos também ficam desabilitados
- O caminho é representado por strings separadas por pontos (ex: "esse.campo.pode.ser.extenso")

### Exemplo de Estrutura
```json
{
  "application": "app",
  "toggles": {
    "esse": {
      "value": "esse",
      "enabled": true,
      "toggle": [
        {
          "value": "campo",
          "enabled": true,
          "toggle": [
            {
              "value": "pode",
              "enabled": false,
              "toggle": [
                {
                  "value": "ser",
                  "enabled": true,
                  "toggle": [
                    {
                      "value": "extenso",
                      "enabled": true
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  }
}
```

Neste exemplo, se `esse.campo.pode` estiver desabilitado, mesmo que `esse.campo.pode.ser.extenso` esteja habilitado, a resposta será `false`.

## API Endpoints

### Aplicações
- `POST /applications` - Criar aplicação
- `GET /applications` - Listar aplicações
- `GET /applications/:id` - Buscar aplicação por ID
- `PUT /applications/:id` - Atualizar aplicação
- `DELETE /applications/:id` - Remover aplicação

### Toggles
- `POST /applications/:id/toggles` - Criar toggle
- `GET /applications/:id/toggles` - Listar toggles
- `GET /applications/:id/toggles?hierarchy=true` - Listar hierarquia de toggles
- `GET /applications/:id/toggles/status?path=esse.campo.pode` - Verificar status de toggle
- `PUT /applications/:id/toggles?path=esse.campo.pode` - Atualizar toggle
- `DELETE /applications/:id/toggles?path=esse.campo.pode` - Remover toggle

## Exemplos de Uso

### Criar Aplicação
```bash
curl -X POST http://localhost:8081/applications \
  -H "Content-Type: application/json" \
  -d '{"name": "Minha Aplicação"}'
```

### Criar Toggle
```bash
curl -X POST http://localhost:8081/applications/{app_id}/toggles \
  -H "Content-Type: application/json" \
  -d '{"toggle": "esse.campo.pode.ser.extenso", "enabled": true}'
```

### Verificar Status de Toggle
```bash
curl -X GET "http://localhost:8081/applications/{app_id}/toggles/status?path=esse.campo.pode"
```

### Listar Hierarquia de Toggles
```bash
curl -X GET "http://localhost:8081/applications/{app_id}/toggles?hierarchy=true"
```

## Tratamento de Erros

Todos os erros seguem o formato padronizado:
```json
{
  "code": "T0001",
  "message": "erro message"
}
```

### Códigos de Erro
- `T0001`: Erro de validação
- `T0002`: Recurso não encontrado
- `T0003`: Recurso já existe
- `T0004`: Erro de banco de dados
- `T0005`: Erro interno
- `T0006`: Caminho inválido
- `T0007`: Toggle inválido

## Tecnologias

- **Go 1.22.4**
- **Gin** - Framework web
- **GORM** - ORM para banco de dados
- **SQLite** - Banco de dados

## Executando o Projeto

### Usando Makefile (Recomendado)
O projeto inclui um Makefile com comandos úteis:

```bash
make help          # Mostra todos os comandos disponíveis
make dev           # Roda em modo desenvolvimento (migrate + run)
make run           # Roda a aplicação localmente
make build         # Compila o binário
make test          # Executa os testes
make clean         # Remove binário e banco de dados
```

### Migrations
```bash
make migrate-up    # Aplica todas as migrations
make migrate-down  # Desfaz a última migration
make migrate-status # Mostra o status das migrations
```

### Docker
```bash
make docker-build  # Constrói a imagem Docker
make docker-run    # Roda o container Docker
```

### Execução Manual
1. Clone o repositório
2. Execute `go mod tidy` para instalar as dependências
3. Execute `make migrate-up` para aplicar as migrations
4. Execute `make run` para iniciar o servidor
5. O servidor estará disponível em `http://localhost:8081`

## Testando a API

Após iniciar o servidor, você pode testar as funcionalidades usando o script de exemplos:

```bash
# Execute o script de exemplos
./examples/api_examples.sh
```

Ou teste manualmente usando curl:

```bash
# Criar aplicação
curl -X POST http://localhost:3056/applications \
  -H "Content-Type: application/json" \
  -d '{"name": "Minha Aplicação"}'

# Criar toggle
curl -X POST http://localhost:3056/applications/{app_id}/toggles \
  -H "Content-Type: application/json" \
  -d '{"toggle": "esse.campo.pode.ser.extenso", "enabled": true}'

# Verificar status
curl -X GET "http://localhost:3056/applications/{app_id}/toggles/status?path=esse.campo.pode"
```

## Estrutura do Projeto

```
toToogle/
├── internal/
│   └── app/
│       ├── domain/
│       │   ├── entity/          # Entidades do domínio
│       │   └── repository/      # Interfaces dos repositórios
│       ├── usecase/             # Casos de uso
│       ├── infrastructure/
│       │   └── database/        # Implementações dos repositórios
│       ├── handler/             # Handlers HTTP
│       ├── router/              # Configuração de rotas
│       └── config/              # Configurações
├── db/                          # Arquivo do banco SQLite
├── go.mod
├── go.sum
└── main.go
``` 