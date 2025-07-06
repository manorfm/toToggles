# ToToggle

A simple and effective feature toggle management application built with Go and modern web technologies.

## 🚀 Features

- **Hierarchical Feature Toggles**: Manage complex toggle hierarchies with parent-child relationships
- **RESTful API**: Clean, well-documented API built with Go and Gin framework
- **Modern UI**: Responsive, intuitive interface built with vanilla HTML, CSS, and JavaScript
- **Real-time Status**: Visual indicators for toggle status with color-coded states
- **Application Management**: Create and manage multiple applications with their respective toggles
- **Hierarchical Visualization**: View toggle hierarchies in a tree-like structure
- **Bulk Operations**: Enable/disable toggles recursively affecting all child toggles


## 🏗️ Architecture

The application follows Clean Architecture and Hexagonal Architecture principles:

```
┌─────────────────────────────────────────────────────────────┐
│                        Presentation Layer                   │
├─────────────────────────────────────────────────────────────┤
│  Handlers (HTTP)  │  Static Files (HTML/CSS/JS)  │  Router │
├─────────────────────────────────────────────────────────────┤
│                        Application Layer                    │
├─────────────────────────────────────────────────────────────┤
│  Use Cases (Business Logic)  │  Application Services       │
├─────────────────────────────────────────────────────────────┤
│                        Domain Layer                        │
├─────────────────────────────────────────────────────────────┤
│  Entities  │  Repository Interfaces  │  Domain Services    │
├─────────────────────────────────────────────────────────────┤
│                    Infrastructure Layer                     │
├─────────────────────────────────────────────────────────────┤
│  Database (SQLite/GORM)  │  External Services  │  Config  │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

- **Domain**: Core business entities and rules
- **Use Cases**: Application business logic and orchestration
- **Interfaces**: Repository contracts and service abstractions
- **Infrastructure**: Database implementations and external integrations
- **Application**: Configuration and dependency injection

## 📋 Prerequisites

- Go 1.22.4 or higher
- SQLite (embedded)
- Make (optional, for using Makefile commands)

## 🛠️ Installation & Setup

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/manorfm/totoogle.git
   cd totoogle
   ```

2. **Install dependencies**
   ```bash
   go mod tidy
   ```

3. **Run the application**
   ```bash
   make dev
   ```

4. **Access the application**
   - Web UI: http://localhost:8081
   - API: http://localhost:8081/applications

### Manual Setup

1. **Install dependencies**
   ```bash
   go mod download
   ```

2. **Run database migrations**
   ```bash
   make migrate-up
   ```

3. **Start the server**
   ```bash
   make run
   ```

## 🎯 Usage

### Web Interface

1. **Create an Application**
   - Click "New Application" button
   - Enter application name
   - Click "Create"

2. **Add Feature Toggles**
   - Click the "eye" icon on an application card
   - Click "New Toggle" button
   - Enter toggle path (e.g., `feature.new.dashboard`)
   - Set initial enabled state
   - Click "Create"

3. **Manage Toggle Hierarchy**
   - Toggles are automatically organized in a hierarchical structure
   - Parent toggles control child toggles
   - Click on toggle paths to edit individual nodes
   - Use the recursive update feature to affect all children
   - **Novo:** O caminho dos toggles aparece como uma palavra corrida, cada parte é interativa e ao passar o mouse há um efeito visual moderno e responsivo.

### API Usage

#### Applications

```bash
# Create application (handler.CreateApplication)
curl -X POST http://localhost:8081/applications \
  -H "Content-Type: application/json" \
  -d '{"name": "My Application"}'

# List applications (handler.GetAllApplications)
curl http://localhost:8081/applications

# Get application by ID (handler.GetApplication)
curl http://localhost:8081/applications/{app_id}

# Update application (handler.UpdateApplication)
curl -X PUT http://localhost:8081/applications/{app_id} \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name"}'

# Delete application (handler.DeleteApplication)
curl -X DELETE http://localhost:8081/applications/{app_id}
```

#### Feature Toggles

```bash
# Create toggle (handler.CreateToggle)
curl -X POST http://localhost:8081/applications/{app_id}/toggles \
  -H "Content-Type: application/json" \
  -d '{"toggle": "feature.new.dashboard"}'

# List all toggles (flat, default) (handler.GetAllToggles)
curl http://localhost:8081/applications/{app_id}/toggles

# List all toggles as hierarchy (handler.GetAllToggles)
curl "http://localhost:8081/applications/{app_id}/toggles?hierarchy=true"

# Get toggle status by ID (handler.GetToggleStatus)
curl http://localhost:8081/applications/{app_id}/toggles/{toggle_id}

# Update toggle by ID (handler.UpdateToggle)
curl -X PUT http://localhost:8081/applications/{app_id}/toggles/{toggle_id} \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Update toggle recursively (handler.UpdateEnabled)
curl -X PUT http://localhost:8081/applications/{app_id}/toggle/{toggle_id} \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Delete toggle by ID (handler.DeleteToggle)
curl -X DELETE http://localhost:8081/applications/{app_id}/toggles/{toggle_id}
```

- Quando `hierarchy=true` é passado, a resposta será uma árvore de toggles (com filhos aninhados).
- Sem o parâmetro, a resposta é uma lista plana.

## 🏗️ Project Structure

```
toToogle/
├── internal/
│   └── app/
│       ├── config/              # Configuration and initialization
│       │   ├── config.go        # Main configuration
│       │   ├── db.go           # Database setup
│       │   └── logger.go       # Logging configuration
│       ├── domain/             # Domain layer
│       │   ├── entity/         # Business entities
│       │   │   ├── application.go
│       │   │   ├── toggle.go
│       │   │   └── error.go
│       │   └── repository/     # Repository interfaces
│       │       ├── application_repository.go
│       │       └── toggle_repository.go
│       ├── usecase/            # Application layer
│       │   ├── application_usecase.go
│       │   ├── toggle_usecase.go
│       │   └── mocks.go        # Test mocks
│       ├── infrastructure/     # Infrastructure layer
│       │   └── database/       # Database implementations
│       │       ├── application_repository.go
│       │       └── toggle_repository.go
│       ├── handler/            # Presentation layer
│       │   ├── application_handler.go
│       │   ├── toggle_handler.go
│       │   ├── static_handler.go
│       │   └── init.go
│       └── router/             # Routing configuration
│           ├── router.go
│           └── routes.go
├── static/                     # Frontend assets
│   ├── index.html
│   ├── script.js
│   └── styles.css
├── db/                         # Database files
├── main.go                     # Application entry point
├── go.mod                      # Go module definition
├── go.sum                      # Go module checksums
├── Makefile                    # Build and development commands
├── Dockerfile                  # Container configuration
├── docker-compose.yml          # Docker orchestration
└── README.md                   # This file
```

## 🧪 Testing

### Run Tests
```bash
# Run all tests
make test

# Run tests with coverage
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out -o coverage.html

# Run specific test package
go test ./internal/app/domain/entity
```

### Test Coverage
The project maintains high test coverage across all layers:
- Domain entities: 100%
- Use cases: 60%+
- Handlers: 40%+
- Infrastructure: 65%+
- Configuration: 100%

## 🐳 Docker

### Build and Run with Docker
```bash
# Build image
make docker-build

# Run container
make docker-run

# Or use docker-compose
docker-compose up -d
```

### Docker Compose
```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 🔧 Development

### Available Make Commands
```bash
make help          # Show all available commands
make dev           # Development mode (migrate + run)
make run           # Run the application
make build         # Build binary
make test          # Run tests
make clean         # Clean build artifacts
make migrate-up    # Run database migrations
make migrate-down  # Rollback migrations
make migrate-status # Show migration status
make docker-build  # Build Docker image
make docker-run    # Run Docker container
```

### Database Migrations
```bash
# Apply migrations
make migrate-up

# Rollback last migration
make migrate-down

# Check migration status
make migrate-status
```

### Code Quality
```bash
# Format code
go fmt ./...

# Run linter
golangci-lint run

# Run vet
go vet ./...
```

## 📊 API Reference

### Error Handling
All API errors follow a consistent format:
```json
{
  "code": "T0001",
  "message": "Error description"
}
```

### Error Codes
- `T0001`: Validation error
- `T0002`: Resource not found
- `T0003`: Resource already exists
- `T0004`: Database error
- `T0005`: Internal server error
- `T0006`: Invalid path
- `T0007`: Invalid toggle

### Response Formats

#### Application
```json
{
  "id": "01JZDH3YFPR88WB6DTRPMRSHRE",
  "name": "My Application",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "toggles_enabled": 5,
  "toggles_disabled": 2,
  "toggles_total": 7
}
```

#### Toggle Hierarchy
```json
{
  "application": "app123",
  "toggles": [
    {
      "id": "toggle1",
      "value": "feature",
      "enabled": true,
      "toggles": [
        {
          "id": "toggle2",
          "value": "new",
          "enabled": true,
          "toggles": [
            {
              "id": "toggle3",
              "value": "dashboard",
              "enabled": false
            }
          ]
        }
      ]
    }
  ]
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow Go coding standards
- Write tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting PR

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Gin](https://github.com/gin-gonic/gin) - HTTP web framework
- [GORM](https://gorm.io/) - ORM library
- [SQLite](https://www.sqlite.org/) - Database engine
- [Lucide Icons](https://lucide.dev/) - Icon library

---

**Made by Manoel Medeiros**

For questions, issues, or contributions, please open an issue on GitHub.

## API Routes

### Applications
- `POST   /applications`                → CreateApplication
- `GET    /applications`                → GetAllApplications
- `GET    /applications/:id`            → GetApplication
- `PUT    /applications/:id`            → UpdateApplication
- `DELETE /applications/:id`            → DeleteApplication

### Toggles
- `POST   /applications/:id/toggles`                → CreateToggle
- `GET    /applications/:id/toggles`                → GetAllToggles
- `GET    /applications/:id/toggles/:toggleId`      → GetToggleStatus
- `PUT    /applications/:id/toggles/:toggleId`      → UpdateToggle
- `DELETE /applications/:id/toggles/:toggleId`      → DeleteToggle
- `PUT    /applications/:id/toggle/:toggleId`       → UpdateEnabled (recursively)

### Static & Misc
- `GET    /static/*`                   → Serve static assets (HTML, CSS, JS)
- `GET    /LICENSE`                    → Serve LICENSE file
- `GET    /`                           → Serve frontend (index.html)

--- 