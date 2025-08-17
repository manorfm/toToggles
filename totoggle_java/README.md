# ToToggle - Complete Feature Flag Management Platform

A comprehensive feature toggle management platform consisting of a Go-based server and a Java/Kotlin client library. This solution provides enterprise-scale feature flag management with robust user access controls, team collaboration, and client libraries for easy integration.

## 🏗️ Project Structure

```
toToogle/
├── server/                     # Go-based ToToggle server
│   ├── internal/
│   │   └── app/
│   │       ├── config/         # Configuration and database setup
│   │       ├── domain/         # Domain entities and business logic
│   │       ├── handler/        # HTTP handlers (controllers)
│   │       ├── infrastructure/ # Database implementations
│   │       ├── middleware/     # HTTP middleware
│   │       ├── router/         # Route definitions
│   │       └── usecase/        # Application use cases
│   ├── static/                 # Frontend assets (HTML/CSS/JS)
│   ├── db/                     # Database migrations and files
│   ├── main.go                 # Application entry point
│   └── README.md               # Server documentation
│
└── totoggle_java/              # Java/Kotlin client library
    ├── src/
    │   ├── main/kotlin/com/totoggle/client/
    │   │   ├── ToToggleClient.kt         # Main client class
    │   │   ├── config/                   # Configuration classes
    │   │   ├── model/                    # Data models
    │   │   ├── strategy/                 # Activation rule strategies
    │   │   ├── http/                     # HTTP client
    │   │   ├── cache/                    # Caching system
    │   │   └── exception/                # Exception definitions
    │   └── test/                         # Comprehensive test suite
    ├── examples/                         # Usage examples
    └── README.md                         # Client library documentation
```

## 🚀 Features

### Server Features
- **Hierarchical Feature Toggles**: Manage complex toggle hierarchies with parent-child relationships
- **Advanced Activation Rules**: Percentage-based rollouts, parameter targeting, user ID targeting
- **Multi-Level Authentication**: Root, admin, and user roles with granular permissions
- **Team-Based Access Control**: Organize users into teams with application-specific permissions
- **Secret Key Management**: Secure API keys for external access
- **Modern Web Interface**: Responsive UI with role-based controls
- **RESTful API**: Clean API for programmatic access

### Client Library Features
- **Simple API**: Easy-to-use interface for checking feature toggle status
- **Cascading Validation**: Automatic validation of parent toggles
- **Activation Strategies**: Support for percentage and parameter-based rules
- **Caching & Resilience**: Efficient caching with offline mode support
- **Thread-Safe**: Designed for concurrent use
- **Comprehensive Logging**: Configurable logging levels
- **Clean Architecture**: Built with design patterns and clean code principles

## 🛠️ Quick Start

### 1. Server Setup

```bash
cd server
go mod tidy
make dev
```

The server will start on http://localhost:8081 with default credentials: `admin / admin`

### 2. Client Library Usage

```kotlin
// Add dependency to your project
implementation("com.totoggle:totoggle-java:1.0.0")

// Configure and start the client
val config = ToToggleConfig.builder()
    .applicationName("my-app")
    .serverUrl("http://localhost:8081")
    .secretKey("sk_your_secret_key_here")
    .build()

val client = ToToggleClient(config)
client.start()

// Check if a feature is active
val isActive = client.isActive("user.payments.view-table")

// Check with parameter
val isPremiumActive = client.isActive("user.premium.features", "premium")

client.shutdown()
```

## 📊 API Example

### Server API Response
```bash
curl -H "X-API-Key: sk_your_secret_key" http://localhost:8081/api/toggles
```

```json
{
  "application": {
    "id": "01K2RABG03N3FHCGH7PAVASWGA",
    "name": "payment-service",
    "toggles": [
      {
        "id": "01K2SN62NQM9XCHBHYS818DPK8",
        "path": "user",
        "value": "user",
        "enabled": true,
        "level": 0,
        "parent_id": null,
        "app_id": "01K2RABG03N3FHCGH7PAVASWGA",
        "has_activation_rule": false,
        "activation_rule": {"type": "", "value": ""}
      },
      {
        "id": "01K2SN62P1W50TEV6BA156R9XQ",
        "path": "user.payments.view-table",
        "value": "view-table",
        "enabled": true,
        "level": 2,
        "parent_id": "01K2SN62NXSGQBFNT2K0MWQ9JK",
        "app_id": "01K2RABG03N3FHCGH7PAVASWGA",
        "has_activation_rule": true,
        "activation_rule": {"type": "percentage", "value": "25"}
      }
    ]
  }
}
```

## 🎯 Use Cases

### 1. Simple Feature Flags
```kotlin
if (client.isActive("new.checkout.flow")) {
    // Use new checkout process
    return processNewCheckout(order)
} else {
    // Use legacy checkout
    return processLegacyCheckout(order)
}
```

### 2. A/B Testing with Percentages
```kotlin
// Server configured with 25% activation
if (client.isActive("experiment.new.algorithm")) {
    // 25% of users see new algorithm
    return newRecommendationAlgorithm(user)
} else {
    // 75% see existing algorithm
    return existingRecommendationAlgorithm(user)
}
```

### 3. User Tier Features
```kotlin
if (client.isActive("premium.features", user.tier)) {
    // Only premium users see these features
    return premiumDashboard()
} else {
    return basicDashboard()
}
```

### 4. Cascading Feature Control
```
user                     (disabled)
└── user.payments        (enabled)
    └── user.payments.new-ui (enabled)
```

In this case, `client.isActive("user.payments.new-ui")` returns `false` because the parent `user` toggle is disabled, even though the specific toggle is enabled.

## 🔒 Security Features

### Server Security
- **Role-Based Access Control**: Root, admin, and user roles
- **Team Isolation**: Users only see applications assigned to their teams
- **Secure Session Management**: HTTP-only cookies with proper validation
- **Secret Key Security**: API keys passed via headers, not URLs
- **Password Security**: Bcrypt hashing with forced password changes

### Client Security
- **Secure Communication**: HTTPS support with proper certificate validation
- **Secret Key Management**: Keys passed in headers, never logged
- **Defensive Programming**: Safe defaults when server is unreachable
- **Input Validation**: Comprehensive validation of all configuration

## 🧪 Testing

### Server Tests
```bash
cd server
make test
```

### Client Library Tests
```bash
cd totoggle_java
./gradlew test
```

Both projects maintain high test coverage with unit, integration, and end-to-end tests.

## 📈 Performance & Scalability

### Server Performance
- **Efficient Database Queries**: Optimized queries with proper indexing
- **Caching Strategy**: In-memory caching for frequently accessed data
- **Minimal Dependencies**: Lightweight Go implementation

### Client Performance
- **Background Refresh**: Non-blocking updates from server
- **Local Caching**: Fast toggle evaluation with cached data
- **Connection Pooling**: Efficient HTTP connection reuse
- **Resilience**: Continue working when server is unreachable

## 🔧 Configuration

### Server Configuration
```bash
# Environment variables
export GIN_MODE=release
export DB_PATH=./db/toggles.db
export SERVER_PORT=8081
```

### Client Configuration
```kotlin
val config = ToToggleConfig.builder()
    .applicationName("my-app")
    .serverUrl("https://your-server.com")
    .secretKey("sk_your_secret_key")
    .refreshInterval(Duration.ofMinutes(5))
    .connectionTimeout(Duration.ofSeconds(10))
    .enableOfflineMode(true)
    .logLevel(LogLevel.INFO)
    .build()
```

## 📚 Documentation

- [Server Documentation](server/README.md) - Complete server setup and API reference
- [Client Library Documentation](totoggle_java/README.md) - Java/Kotlin client usage guide
- [API Reference](server/README.md#-api-reference) - Complete API documentation
- [Examples](totoggle_java/examples/) - Usage examples and patterns

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow Go and Kotlin coding standards
- Write tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting PR

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](server/LICENSE) file for details.

## 🙏 Acknowledgments

- [Gin](https://github.com/gin-gonic/gin) - HTTP web framework for Go
- [GORM](https://gorm.io/) - ORM library for Go
- [OkHttp](https://square.github.io/okhttp/) - HTTP client for Kotlin/Java
- [Jackson](https://github.com/FasterXML/jackson) - JSON processing for Java

---

**Made by Manoel Medeiros**

For questions, issues, or contributions, please open an issue on GitHub.