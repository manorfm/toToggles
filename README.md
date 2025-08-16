# ToToogle

A comprehensive feature toggle management platform built with Go and modern web technologies, designed for enterprise-scale feature flag management with robust user access controls and team collaboration.

## 🚀 Features

### Core Toggle Management
- **Hierarchical Feature Toggles**: Manage complex toggle hierarchies with parent-child relationships
- **Conditional Activation Rules**: Advanced rule-based toggle activation with support for:
  - Percentage-based rollouts
  - Canary releases
  - Parameter-based targeting
  - User ID targeting
  - IP address filtering
  - Country-based activation
  - Time-based activation
- **Bulk Operations**: Enable/disable toggles recursively affecting all child toggles
- **Interactive Toggle Paths**: Modern visual toggle path representation with responsive hover effects

### User Management & Security
- **Multi-Level Authentication**: Secure role-based access control system
  - **Root Users**: Super administrators with full system access
  - **Admin Users**: Application and data management capabilities
  - **Regular Users**: Read-only access to assigned applications
- **Team-Based Access Control**: Organize users into teams with granular permissions
- **Session Management**: Persistent authentication with secure HTTP-only cookies
- **Password Security**: Bcrypt-hashed passwords with forced password change support

### Application & Secret Management
- **Multi-Application Support**: Create and manage multiple applications with isolated toggle sets
- **Secret Key Management**: Generate and manage API keys for secure external access
- **Team-Application Permissions**: Assign teams to applications with specific permission levels:
  - Read: View-only access
  - Write: Modify toggles and settings
  - Admin: Full application control

### Modern Web Interface
- **Responsive Design**: Modern, intuitive interface optimized for all devices
- **Real-time Status Indicators**: Visual toggle status with color-coded states
- **Profile Management**: User profile settings with team visibility (hidden for root users)
- **User Management Interface**: Comprehensive user administration for root users
- **Dark Mode Ready**: Modern design system with CSS custom properties

### API & Integration
- **RESTful API**: Clean, well-documented API built with Go and Gin framework
- **External API Access**: Public API endpoints using secret keys for integration
- **Comprehensive Error Handling**: Structured error responses with detailed codes


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
   - Web UI: http://localhost:8081 (requires login)
   - Login Page: http://localhost:8081/login
   - API: http://localhost:8081/applications (requires authentication)
   - Default credentials: `admin / admin`

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

### Initial Setup

1. **First Run**
   - Access http://localhost:8081/login
   - Use default credentials: `admin / admin`
   - Root user has access to all features including user management

### User Management (Root Users Only)

1. **Managing Users**
   - Access User Management from the profile menu
   - Create new users with specific roles (root/admin/user)
   - Assign users to teams for application access
   - Force password changes for security

2. **Team Management**
   - Create teams to organize users
   - Assign teams to applications with specific permissions
   - Manage team membership and access levels

### Application Management

1. **Create Applications**
   - Click "New Application" button
   - Enter application name and assign to a team
   - Teams control which users can access the application

2. **Generate Secret Keys**
   - Navigate to application toggles view
   - Click "Generate Secret Key" 
   - Copy the generated key (shown only once for security)
   - Use for external API access without authentication

### Feature Toggle Management

1. **Create Feature Toggles**
   - Click the application card to view toggles
   - Click "New Toggle" button
   - Enter hierarchical toggle path (e.g., `feature.new.dashboard`)
   - Toggles are automatically organized in a tree structure

2. **Configure Advanced Rules**
   - Edit toggles to access activation rules
   - Set conditional activation based on:
     - Percentage rollouts (e.g., 25% of users)
     - Parameter values
     - User IDs, IP addresses, countries
     - Time-based activation
   - Combine rules for complex targeting

3. **Manage Toggle Hierarchy**
   - Interactive toggle paths with hover effects
   - Parent toggles control child toggle behavior
   - Use recursive updates to affect entire subtrees
   - Real-time visual status indicators

### Profile & Security

1. **Profile Management**
   - Access via user menu in header
   - View user information and role
   - See team memberships (hidden for root users)
   - Change password with secure validation

2. **Security Features**
   - Session persistence across browser restarts
   - Secure HTTP-only cookies
   - Role-based access control
   - Team-based application isolation

### API Usage

#### Authentication

```bash
# Login to get session cookie
curl -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin"}' \
  -c cookies.txt

# Logout
curl -X POST http://localhost:8081/auth/logout \
  -b cookies.txt
```

#### Applications

```bash
# Create application (requires authentication)
curl -X POST http://localhost:8081/applications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"name": "My Application"}'

# List applications (requires authentication)
curl http://localhost:8081/applications \
  -H "Authorization: Bearer {token}"

# Get application by ID (requires authentication)
curl http://localhost:8081/applications/{app_id} \
  -H "Authorization: Bearer {token}"

# Update application (requires authentication)
curl -X PUT http://localhost:8081/applications/{app_id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"name": "Updated Name"}'

# Delete application (requires authentication)
curl -X DELETE http://localhost:8081/applications/{app_id} \
  -H "Authorization: Bearer {token}"
```

#### Secret Key Management

```bash
# Generate secret key for application (requires authentication)
curl -X POST http://localhost:8081/applications/{app_id}/generate-secret \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"name": "Production Key"}'

# List secret keys for application (requires authentication)
curl http://localhost:8081/applications/{app_id}/secret-keys \
  -H "Authorization: Bearer {token}"

# Delete secret key (requires authentication)
curl -X DELETE http://localhost:8081/secret-keys/{secret_key_id} \
  -H "Authorization: Bearer {token}"

# Get toggles using secret key (public API)
curl http://localhost:8081/api/toggles/by-secret/{secret_key}
```

#### Feature Toggles

```bash
# Create toggle (requires authentication)
curl -X POST http://localhost:8081/applications/{app_id}/toggles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"toggle": "feature.new.dashboard"}'

# List all toggles (flat, default) (requires authentication)
curl http://localhost:8081/applications/{app_id}/toggles \
  -H "Authorization: Bearer {token}"

# List all toggles as hierarchy (requires authentication)
curl "http://localhost:8081/applications/{app_id}/toggles?hierarchy=true" \
  -H "Authorization: Bearer {token}"

# Get toggle status by ID (requires authentication)
curl http://localhost:8081/applications/{app_id}/toggles/{toggle_id} \
  -H "Authorization: Bearer {token}"

# Update toggle by ID (requires authentication)
curl -X PUT http://localhost:8081/applications/{app_id}/toggles/{toggle_id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"enabled": false}'

# Update toggle recursively (requires authentication)
curl -X PUT http://localhost:8081/applications/{app_id}/toggle/{toggle_id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"enabled": false}'

# Delete toggle by ID (requires authentication)
curl -X DELETE http://localhost:8081/applications/{app_id}/toggles/{toggle_id} \
  -H "Authorization: Bearer {token}"
```

- Quando `hierarchy=true` é passado, a resposta será uma árvore de toggles (com filhos aninhados).
- Sem o parâmetro, a resposta é uma lista plana.

#### Using Secret Keys for External Access

```bash
# Get toggles using secret key (no authentication required)
curl http://localhost:8081/api/toggles/by-secret/sk_1234567890abcdef...

# Response includes application ID and all toggles
{
  "success": true,
  "application_id": "01JZDH3YFPR88WB6DTRPMRSHRE",
  "toggles": [
    {
      "id": "toggle123",
      "application_id": "01JZDH3YFPR88WB6DTRPMRSHRE",
      "toggle": "feature.new.dashboard",
      "enabled": true,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

## 🏗️ Project Structure

```
toToogle/
├── internal/
│   └── app/
│       ├── config/                    # Configuration and initialization
│       │   ├── config.go             # Main configuration
│       │   ├── db.go                 # Database setup and migrations
│       │   ├── logger.go             # Logging configuration
│       │   └── config_test.go        # Configuration tests
│       ├── domain/                   # Domain layer (Clean Architecture)
│       │   ├── entity/               # Business entities and domain logic
│       │   │   ├── application.go    # Application entity
│       │   │   ├── toggle.go         # Toggle entity with activation rules
│       │   │   ├── user.go           # User entity with roles and permissions
│       │   │   ├── team.go           # Team entity with user associations
│       │   │   ├── secret_key.go     # Secret key management
│       │   │   ├── activation_rule.go # Advanced toggle activation rules
│       │   │   ├── error.go          # Domain error definitions
│       │   │   └── validation.go     # Domain validation logic
│       │   ├── auth/                 # Authentication strategies
│       │   │   ├── auth_strategy.go  # Auth strategy interface
│       │   │   └── local_strategy.go # Local authentication
│       │   └── repository/           # Repository interfaces
│       │       ├── application_repository.go
│       │       ├── toggle_repository.go
│       │       ├── user_repository.go
│       │       ├── team_repository.go
│       │       └── secret_key_repository.go
│       ├── usecase/                  # Application layer (business logic)
│       │   ├── application_usecase.go
│       │   ├── toggle_usecase.go
│       │   ├── user_usecase.go
│       │   ├── team_usecase.go
│       │   ├── auth_usecase.go
│       │   ├── secret_key_usecase.go
│       │   └── mocks.go              # Test mocks
│       ├── infrastructure/           # Infrastructure layer
│       │   └── database/             # Database implementations
│       │       ├── application_repository.go
│       │       ├── toggle_repository.go
│       │       ├── user_repository.go
│       │       ├── team_repository.go
│       │       └── secret_key_repository.go
│       ├── handler/                  # Presentation layer (HTTP handlers)
│       │   ├── application_handler.go
│       │   ├── toggle_handler.go
│       │   ├── user_handler.go
│       │   ├── user_management_handler.go
│       │   ├── team_handler.go
│       │   ├── auth_handler.go
│       │   ├── secret_key_handler.go
│       │   ├── static_handler.go
│       │   └── init.go               # Dependency injection
│       ├── middleware/               # HTTP middleware
│       │   └── security.go          # Authentication and authorization
│       └── router/                   # Routing configuration
│           ├── router.go             # Main router setup
│           └── routes.go             # Route definitions
├── static/                           # Frontend assets
│   ├── index.html                    # Main application interface
│   ├── login.html                    # Login page
│   ├── change-password.html          # Password change page
│   ├── script.js                     # Application JavaScript
│   ├── login.js                      # Login functionality
│   └── styles.css                    # Modern CSS with responsive design
├── db/                               # Database files and migrations
│   ├── migrations/                   # Database migration files
│   │   ├── 20230703_create_applications_and_toggles.sql
│   │   ├── 20241213_add_activation_rules.sql
│   │   ├── 20241214_add_auth_system.sql
│   │   ├── 20250814_add_teams_system.sql
│   │   └── 20250815_add_user_management_features.sql
│   └── toggles.db                    # SQLite database file
├── main.go                           # Application entry point
├── go.mod                            # Go module definition
├── go.sum                            # Go module checksums
├── Makefile                          # Build and development commands
├── Dockerfile                        # Container configuration
├── docker-compose.yml                # Docker orchestration
└── README.md                         # This documentation
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
make clean         # Clean build artifacts and database
make migrate-up    # Run database migrations
make migrate-down  # Rollback migrations
make migrate-status # Show migration status
make docker-build  # Build Docker image
make docker-run    # Run Docker container
```

## 🆕 Recent Updates & Improvements

### Version 2.0 Features
- **Complete User Management System**: Multi-role authentication with root, admin, and user levels
- **Team-Based Access Control**: Organize users into teams with granular application permissions
- **Advanced Activation Rules**: Conditional toggle activation with multiple targeting options
- **Modern UI Enhancements**: Responsive design with improved user experience
- **Profile Management**: User-specific settings with role-aware interface adjustments
- **Security Improvements**: Enhanced authentication, password management, and session handling

### Database Evolution
- **Migration System**: Comprehensive database versioning with goose
- **Entity Relationships**: Complex many-to-many relationships between users, teams, and applications
- **Security Schema**: Encrypted passwords, secret key management, and audit trails

### API Maturity
- **RESTful Design**: Full CRUD operations across all entities
- **Role-Based Endpoints**: Different API access levels based on user roles
- **Public API**: External integration support via secret keys
- **Comprehensive Error Handling**: Structured error responses with detailed codes

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

### Authentication
- `POST   /auth/login`                  → Login (public)
- `POST   /auth/logout`                 → Logout (public)
- `POST   /auth/change-password`        → Change password (protected)

### User Management (Root Only)
- `POST   /users`                       → CreateUser
- `GET    /users`                       → GetAllUsers
- `GET    /users/:id`                   → GetUser
- `PUT    /users/:id`                   → UpdateUser
- `DELETE /users/:id`                   → DeleteUser

### Team Management (Protected)
- `POST   /teams`                       → CreateTeam
- `GET    /teams`                       → GetAllTeams
- `GET    /teams/:id`                   → GetTeam
- `PUT    /teams/:id`                   → UpdateTeam
- `DELETE /teams/:id`                   → DeleteTeam
- `POST   /teams/:id/users`             → AddUserToTeam
- `DELETE /teams/:id/users/:userId`     → RemoveUserFromTeam

### Profile Management (Protected)
- `GET    /profile`                     → GetUserProfile
- `GET    /profile/teams`               → GetUserTeams

### Applications (Protected)
- `POST   /applications`                → CreateApplication
- `GET    /applications`                → GetAllApplications
- `GET    /applications/:id`            → GetApplication
- `PUT    /applications/:id`            → UpdateApplication
- `DELETE /applications/:id`            → DeleteApplication

### Secret Key Management (Protected)
- `POST   /applications/:id/generate-secret`        → GenerateSecretKey
- `GET    /applications/:id/secret-keys`            → GetSecretKeys
- `DELETE /secret-keys/:id`                         → DeleteSecretKey

### Toggles (Protected)
- `POST   /applications/:id/toggles`                → CreateToggle
- `GET    /applications/:id/toggles`                → GetAllToggles
- `GET    /applications/:id/toggles/:toggleId`      → GetToggleStatus
- `PUT    /applications/:id/toggles/:toggleId`      → UpdateToggle (with activation rules)
- `DELETE /applications/:id/toggles/:toggleId`      → DeleteToggle
- `PUT    /applications/:id/toggle/:toggleId`       → UpdateEnabled (recursively)

### Public API (Secret Key Access)
- `GET    /api/toggles/by-secret/:secret`           → GetTogglesBySecret

### Static & Frontend
- `GET    /static/*`                   → Serve static assets (HTML, CSS, JS)
- `GET    /LICENSE`                    → Serve LICENSE file
- `GET    /login`                      → Login page (public)
- `GET    /change-password`            → Change password page (public)
- `GET    /`                           → Serve frontend (protected)

--- 