# ToToggle

[![server-go](https://github.com/manorfm/toToggles/actions/workflows/server-go.yml/badge.svg)](https://github.com/manorfm/toToggles/actions/workflows/server-go.yml)
[![totoggle-java](https://github.com/manorfm/toToggles/actions/workflows/totoggle-java.yml/badge.svg)](https://github.com/manorfm/toToggles/actions/workflows/totoggle-java.yml)
[![frontend-web](https://github.com/manorfm/toToggles/actions/workflows/frontend-web.yml/badge.svg)](https://github.com/manorfm/toToggles/actions/workflows/frontend-web.yml)
![Kotlin](https://img.shields.io/badge/kotlin-1.9+-blue)
![Java](https://img.shields.io/badge/java-17+-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

A robust, high-performance feature flag system consisting of a Go server and Java/Kotlin client library. ToToggle provides cascading validation, multiple activation strategies, and enterprise-grade resilience features.

## 🎯 What is ToToggle?

ToToggle is a feature flag (feature toggle) management system that allows you to:

- **Control feature rollouts** without deploying new code
- **A/B test features** with percentage-based activation
- **Gradually release features** using parameter-based rules
- **Organize features hierarchically** with cascading validation
- **Maintain high availability** with intelligent caching and offline mode

## 🏗️ Architecture

The system consists of two main components:

```
toToogle/
├── server/          # Go-based ToToggle server
└── totoggle_java/   # Java/Kotlin client library
```

### Server (Go)
The ToToggle server manages feature flag configurations, provides REST APIs, and handles authentication.

### Client Library (Java/Kotlin)
A lightweight, thread-safe client library that:
- Fetches and caches feature flags
- Evaluates activation rules locally
- Provides cascading validation
- Handles network failures gracefully

## 🚀 Quick Start

### Prerequisites

- **Server**: Go 1.19+
- **Client**: Java 17+ or Kotlin 1.9+
- **Build Tool**: Gradle 8.7+

### Installation

#### 1. Start the ToToggle Server

```bash
cd server
make migrate-up   # applies the goose migrations — not automatic, must run before first start
go run main.go
```

The server starts on `http://localhost:3056` by default (override with `SERVER_PORT`).

On first boot, a `root` user is created with a random password written to
`<directory of DB_PATH>/initial-root-password.txt` (owner-only readable, never logged to
stdout — see [totoggle_java/README.md](totoggle_java/README.md#first-boot-getting-the-initial-root-password)
for the full first-login flow). That file is deleted automatically once the forced first-login
password change is completed.

#### 2. Add Client Library to Your Project

**Gradle (Kotlin DSL):**
```kotlin
dependencies {
    implementation(files("path/to/totoggle_java/build/libs/totoggle_java-1.0.0.jar"))
}
```

**Gradle (Groovy):**
```groovy
dependencies {
    implementation files('path/to/totoggle_java/build/libs/totoggle_java-1.0.0.jar')
}
```

### Basic Usage

```kotlin
import com.totoggle.client.ToToggleClient
import com.totoggle.client.config.ToToggleConfig

// Configure the client
val config = ToToggleConfig.builder()
    .applicationName("my-awesome-app")
    .serverUrl("http://localhost:8080")
    .secretKey("sk_your_secret_key_here")
    .refreshInterval(Duration.ofMinutes(5))
    .enableOfflineMode(true)
    .build()

// Initialize and start the client
val client = ToToggleClient(config)
client.start()

// Check if features are active
val isPaymentsEnabled = client.isActive("user.payments")
val isTableViewEnabled = client.isActive("user.payments.view-table", "premium")

// Clean up
client.shutdown()
```

## 🌟 Key Features

### 🔄 Cascading Validation

Features are organized hierarchically. All parent features must be active for a child feature to work:

```
user                    ← Must be active
└── payments           ← Must be active  
    └── view-table     ← Target feature
```

If `user` or `payments` is disabled, `view-table` will automatically be inactive.

### 📊 Activation Strategies

**Percentage Strategy:**
```json
{
  "type": "percentage", 
  "value": "25"
}
```
Activates for ~25% of requests using consistent hashing.

**Parameter Strategy:**
```json
{
  "type": "parameter",
  "value": "premium,enterprise"
}
```
Activates when the provided parameter matches the configured values.

### 🛡️ Resilience & Performance

- **Local Caching**: Reduces server load and improves response times
- **Offline Mode**: Continues operating with cached data during network issues
- **Background Refresh**: Updates cache without blocking application threads
- **Circuit Breaker**: Prevents cascading failures
- **Thread Safety**: Fully concurrent operations

### 🔐 Security

- **API Key Authentication**: Secure server communication
- **Input Validation**: Prevents injection attacks
- **Rate Limiting**: Built-in protection against abuse
- **Audit Logging**: Comprehensive operation tracking

## 📋 Configuration Options

### Client Configuration

```kotlin
val config = ToToggleConfig.builder()
    .applicationName("my-app")              // Required: Your app identifier
    .serverUrl("https://toggle.company.com") // Required: Server URL
    .secretKey("sk_live_...")                // Required: Authentication key
    .refreshInterval(Duration.ofMinutes(5))  // Cache refresh frequency
    .connectionTimeout(Duration.ofSeconds(10)) // HTTP connection timeout
    .readTimeout(Duration.ofSeconds(15))     // HTTP read timeout
    .enableOfflineMode(true)                 // Enable offline resilience
    .logLevel(LogLevel.INFO)                 // Logging verbosity
    .build()
```

### Server Environment Variables

The client library is configured purely programmatically (via `ToToggleConfig.builder()` above —
there's no env var reading built into it). These are the server's:

```bash
SERVER_PORT=3056           # default
DB_PATH=./db/toggles.db    # default
COOKIE_SECURE=true         # default; only set to false for local HTTP-only dev
CORS_ALLOWED_ORIGINS=https://your-frontend.example.com  # only needed for a cross-origin frontend
TLS_CERT_FILE=/etc/totoggle/tls/cert.pem  # optional — set both to terminate HTTPS in the binary
TLS_KEY_FILE=/etc/totoggle/tls/key.pem
```

## 🧪 Testing

### Run Client Tests

```bash
cd totoggle_java
./gradlew test
```

### Run Server Tests

```bash
cd server
go test ./...
```

### Current Test Results
- **128 tests** passing
- **100% success rate**
- **Full coverage** of core functionality

## 📊 Performance

- **Cache hit ratio**: >95% in typical workloads
- **Response time**: <1ms for cached lookups
- **Memory usage**: ~10MB baseline + ~1KB per feature
- **Network requests**: Configurable refresh interval (default: 5 minutes)

## 🔧 Advanced Usage

### Custom Strategies

Extend activation strategies by implementing the `ActivationStrategy` interface:

```kotlin
class CustomStrategy : ActivationStrategy {
    override fun evaluate(rule: ActivationRule, parameter: String?): Boolean {
        // Your custom logic here
        return true
    }
}
```

### Health Monitoring

```kotlin
// Check client health
if (client.isHealthy()) {
    println("Client is operational")
}

// Get cache information
println(client.getCacheInfo())

// Check for recent errors
client.getLastError()?.let { error ->
    logger.warn("Recent error: ${error.message}")
}
```

### Manual Cache Refresh

```kotlin
// Force immediate refresh
client.refresh()
```

## 🐛 Troubleshooting

### Common Issues

**Client won't start:**
- Verify server URL is accessible
- Check API key format (should start with `sk_`)
- Ensure application name is configured

**Features not updating:**
- Check network connectivity
- Verify refresh interval configuration
- Review server logs for errors

**High memory usage:**
- Reduce refresh frequency
- Check for feature flag proliferation
- Monitor cache size

### Debug Mode

Enable detailed logging:

```kotlin
val config = ToToggleConfig.builder()
    // ... other config
    .logLevel(LogLevel.DEBUG)
    .build()
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Setup

```bash
# Clone the repository
git clone https://github.com/yourorg/totoggle.git
cd totoggle

# Setup server
cd server
go mod tidy

# Setup client
cd ../totoggle_java
./gradlew build
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

- **Documentation**: [Wiki](https://github.com/manorfm/toToggles/wiki)
- **Issues**: [GitHub Issues](https://github.com/manorfm/toToggles/issues)
- **Discussions**: [GitHub Discussions](https://github.com/manorfm/toToggles/discussions)

---

**Built with ❤️ for reliable feature management**
