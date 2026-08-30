# ToToggle

[![server-go](https://github.com/manorfm/toToggles/actions/workflows/server-go.yml/badge.svg)](https://github.com/manorfm/toToggles/actions/workflows/server-go.yml)
[![totoggle-java](https://github.com/manorfm/toToggles/actions/workflows/totoggle-java.yml/badge.svg)](https://github.com/manorfm/toToggles/actions/workflows/totoggle-java.yml)
[![totoggle-go](https://github.com/manorfm/toToggles/actions/workflows/totoggle-go.yml/badge.svg)](https://github.com/manorfm/toToggles/actions/workflows/totoggle-go.yml)
[![totoggle-node](https://github.com/manorfm/toToggles/actions/workflows/totoggle-node.yml/badge.svg)](https://github.com/manorfm/toToggles/actions/workflows/totoggle-node.yml)
[![frontend-web](https://github.com/manorfm/toToggles/actions/workflows/frontend-web.yml/badge.svg)](https://github.com/manorfm/toToggles/actions/workflows/frontend-web.yml)
![License](https://img.shields.io/badge/license-MIT-blue)

A feature flag (feature toggle) management platform: a Go server with a role-based admin UI, team
management, and an optional approval workflow for sensitive changes, plus 3 official client
libraries (Kotlin/Java, Go, Node/TypeScript) that fetch and cache toggles locally and evaluate
them with cascading validation and 7 activation rule types.

## 🎯 What is ToToggle?

**Server capabilities:**
- **Hierarchical toggles** (`service.feature.flag`) with cascading validation — a disabled parent
  disables every descendant, regardless of the child's own state
- **7 activation rule types**: percentage rollout (consistent per-key hashing), parameter,
  user ID, IP/CIDR, country, time window, and canary
- **Role-based access control**: `root`/`admin`/`user`, with teams scoping which applications an
  admin can manage
- **Optional approval workflow**: gate selected mutation types (toggle delete, rule changes,
  application/secret-key create/delete, etc.) behind a propose → approve → execute flow
- **Public secret-key API** (`GET /api/toggles`, `X-API-Key` header) for external services/client
  libraries to fetch an application's toggles — no session/cookie involved
- **Production-ready by default**: structured JSON logging, optional TLS, a Jenkins-style
  initial-root-password flow (file-only, never stdout/logs), self-applying database migrations
  (no external tool needed even in the minimal production Docker image)

**Client library capabilities** (all 3 — see each one's own README for the language-specific API):
- Fetch and cache toggles locally — evaluation never blocks on the network
- Evaluate all 7 activation rule types, with cascading validation matching the server's semantics
- Background refresh with configurable interval, and offline mode (keep serving cached data if
  the server becomes unreachable)
- Observability hooks (refresh success/failure, evaluation events) and health/staleness getters

## 🏗️ Architecture

```
toToggles/
├── server/           # Go server: REST API + role-based admin UI (React/Vite), same-origin,
│                      # single SQLite-backed binary — see server/README.md and server/CLAUDE.md
├── totoggle_java/     # Kotlin/Java client library (Gradle)
├── totoggle_go/       # Go client library (go get github.com/manorfm/toToggles/totoggle_go)
├── totoggle_node/     # Node.js/TypeScript client library (npm)
├── stress-tests/      # Gatling/Kotlin load tests against the server's public toggle API
└── docs/
    └── rest-flow.md   # Full REST API contract — source of truth for any integration
```

The server is a single Go binary: it serves both the REST API and the built admin frontend from
the same origin (no separate frontend process, no CORS needed for the browser UI under normal
deployment — see "Security" below). Each client library is fully independent — its own module,
own tests, own CI workflow — and only talks to the server over the public secret-key API.

## 🚀 Quick Start

### Prerequisites

- **Server**: Go 1.23+
- **Kotlin/Java client**: Java 17+ or Kotlin 1.9+, Gradle 8.7+
- **Go client**: Go 1.23+
- **Node/TypeScript client**: Node.js 20+

### Installation

#### 1. Start the ToToggle Server

```bash
cd server
go run main.go
```

The binary applies its own database migrations at startup — no separate step, and nothing to
install, including inside the production Docker image.

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
    .serverUrl("http://localhost:3056")
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

### Other Client Libraries

The Kotlin/Java example above is the original client; **Go and Node/TypeScript are equally
complete** (same cascading-validation semantics, all 7 rule types, offline mode, observability
hooks) — see each one's own README for its language-idiomatic API and a full usage example:

- **Go**: [`totoggle_go/README.md`](totoggle_go/README.md) — `go get github.com/manorfm/toToggles/totoggle_go`
- **Node/TypeScript**: [`totoggle_node/README.md`](totoggle_node/README.md) — `npm install totoggle-node`

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

- **Local Caching**: evaluation never touches the network — every client reads from its own
  in-memory cache
- **Offline Mode**: keeps serving the last successfully fetched data if the server becomes
  unreachable, instead of failing closed
- **Background Refresh**: updates the cache on a configurable interval without blocking callers
- **Thread Safety**: safe for concurrent use in all 3 client libraries

### 🔐 Security

- **Session auth (admin UI)**: opaque, server-side-validated session tokens in an `HttpOnly`,
  `SameSite=Strict` cookie (not JWT — see `server/CLAUDE.md` for why), cookie-only — no
  `Authorization` header alternative. No CORS configuration either: the cookie's
  `SameSite=Strict` already blocks cross-site use regardless, the admin UI is served same-origin
  by this same binary, and this deployment has no separately-hosted frontend or internet exposure
  to protect against — see `server/CLAUDE.md` if that ever changes.
- **Public API auth (external services/client libraries)**: a `sk_`-prefixed, 256-bit
  `crypto/rand` secret key, stored **only as its SHA-256 hash** (never plaintext), looked up by an
  indexed hash column — not session/cookie-based, and never subject to CORS in the first place (a
  browser-only mechanism; every client library is a server-to-server caller). Regenerating a key
  deletes the prior one (real rotation, not additive).
- **Login rate limiting**: `POST /api/auth/login` is capped per IP (in-memory sliding window,
  resets on success) — not yet extended to the public secret-key endpoint, though its 256-bit
  keyspace makes brute force impractical regardless.
- **TLS**: optional, terminated directly in the binary (`TLS_CERT_FILE`/`TLS_KEY_FILE`) —
  half-configured TLS fails the boot loudly rather than silently falling back to plain HTTP.
- **Structured JSON logging**, and a Jenkins-style initial-root-password flow (file-only, `0600`,
  auto-deleted after first login — never printed to stdout/logs).

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
TLS_CERT_FILE=/etc/totoggle/tls/cert.pem  # optional — set both to terminate HTTPS in the binary
TLS_KEY_FILE=/etc/totoggle/tls/key.pem
```

## 🧪 Testing

```bash
cd server && go test ./...              # Go server
cd totoggle_java && ./gradlew test      # Kotlin/Java client
cd totoggle_go && go test ./...         # Go client
cd totoggle_node && npm test            # Node/TypeScript client
```

Each component's CI badge above reflects its current, real test status — no test count is
hardcoded here, since it goes stale the moment any suite grows.

## 🔧 Advanced Usage

*(Kotlin/Java client examples below — see [`totoggle_go/README.md`](totoggle_go/README.md) and
[`totoggle_node/README.md`](totoggle_node/README.md) for the equivalent Go/TypeScript APIs.)*

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
git clone https://github.com/manorfm/toToggles.git
cd toToggles

# Setup server
cd server
go mod tidy

# Setup a client library (pick one)
cd ../totoggle_java && ./gradlew build
cd ../totoggle_go && go build ./...
cd ../totoggle_node && npm install && npm run build
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

- **Documentation**: [Wiki](https://github.com/manorfm/toToggles/wiki)
- **Issues**: [GitHub Issues](https://github.com/manorfm/toToggles/issues)
- **Discussions**: [GitHub Discussions](https://github.com/manorfm/toToggles/discussions)

---

**Built with ❤️ for reliable feature management**
