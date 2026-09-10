# ToToggle - Complete Feature Flag Management Platform

[![server-go](https://github.com/manorfm/toToggles/actions/workflows/server-go.yml/badge.svg)](https://github.com/manorfm/toToggles/actions/workflows/server-go.yml)
[![totoggle-java](https://github.com/manorfm/toToggles/actions/workflows/totoggle-java.yml/badge.svg)](https://github.com/manorfm/toToggles/actions/workflows/totoggle-java.yml)

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
- **Advanced Activation Rules**: Percentage rollouts, context attributes, and user targeting
- **Multi-Level Authentication**: Root, admin, and user roles with granular permissions
- **Team-Based Access Control**: Organize users into teams with application-specific permissions
- **Secret Key Management**: Secure API keys for external access
- **Modern Web Interface**: Responsive UI with role-based controls
- **RESTful API**: Clean API for programmatic access

### Client Library Features
- **Simple API**: Easy-to-use interface for checking feature toggle status
- **Cascading Validation**: Automatic validation of parent toggles
- **Activation Strategies**: Support for all 7 server-defined rule types — percentage (consistent
  per-key hashing), attribute, user ID, IP address/CIDR, country, time window, and cohort
- **Caching & Resilience**: Efficient caching with offline mode support, configurable refresh
  interval — `isActive()` never blocks on the network, always answers from memory
- **Observability**: staleness-aware health check (`isHealthy()`/`isStale()`), consecutive-failure
  tracking, and an optional `ToToggleMetricsListener` hook for refresh/evaluation events — no
  metrics dependency required
- **Thread-Safe**: Designed for concurrent use
- **Comprehensive Logging**: Configurable logging levels
- **Clean Architecture**: Built with design patterns and clean code principles

## 🛠️ Quick Start

### 1. Server Setup

```bash
cd server
go mod tidy
make dev   # applies its own database migrations at startup — no separate step, nothing to install
```

The server starts on http://localhost:3056 (override with `SERVER_PORT`).

#### First boot: getting the initial `root` password

There's no fixed default account. On first boot (when the `users` table is empty), the server
creates a `root` user with a random password and writes it — **only to a file, never to
stdout/logs** (a container log commonly ends up in a log aggregator, which would be close to
publishing the password) — at `<directory of DB_PATH>/initial-root-password.txt`, owner-only
readable (`0600`). Same idea as Jenkins' initial admin password, minus the part where Jenkins
also echoes it to the console.

```bash
# Running the binary directly (default DB_PATH=./db/toggles.db):
cat db/initial-root-password.txt

# Running via Docker:
docker exec <container> cat /root/db/initial-root-password.txt   # path matches your DB_PATH
```

Log in as `root` with that password — the server forces an immediate password change
(`must_change_password: true` in the login response), and **that file is deleted automatically**
as soon as the change succeeds. If the file is missing and you don't have the password, there's no
recovery path other than resetting the database (this account exists purely to bootstrap real
users/teams — create an admin and stop using `root` day-to-day).

### 2. Client Library Usage

```kotlin
// Add dependency to your project
implementation("io.github.manorfm:totoggle_java:1.0.0")

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
        "activation_rule": null
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
if (client.isActive("premium.features")) {
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

## Request context

Contextual rules are local to the requested toggle; ancestor rules never cascade. Applications
should configure one `RequestContextResolver` and call `client.isActive(path)` without supplying
user or network data at each call site. The resolver exposes only the configured key, such as
`rollout_key`, `country`, or `attributes.plan`. Missing context and resolver failures return
`false`.

`ToggleRequestContext` is the canonical application-owned context:

- `userId` comes only from an authenticated principal.
- `rolloutKey` is a stable, non-secret identity used by percentage rules. It is intentionally
  never derived from a request ID; using the authenticated user ID is common when appropriate.
- `cohort` is a server-owned deployment or experiment ring, such as `beta`.
- `attributes` uses unprefixed names (`"plan"` becomes `attributes.plan`).

`ip` and `country` are transport-owned. The domain context cannot overwrite them.

### Servlet filter

The SDK has no Servlet dependency. Its built-in, framework-neutral `HttpRequestContextAdapter`
is the HTTP boundary for synchronous filters and interceptors. Supply small framework extractors
for socket/header metadata and verified authentication state, then wrap the complete downstream
chain. The adapter copies only the required values, applies the configured proxy trust policy,
and restores the scope even if the chain throws.

```kotlin
val adapter = HttpRequestContextAdapter(
    resolver = resolver,
    metadataExtractor = HttpRequestMetadataExtractor { request: HttpServletRequest ->
        HttpRequestMetadata(
            remoteIp = request.remoteAddr,
            forwarded = request.getHeader("Forwarded"),
            forwardedFor = request.getHeader("X-Forwarded-For"),
            trustedCountryHeader = request.getHeader("CF-IPCountry"),
        )
    },
    authenticatedContextExtractor = AuthenticatedToggleContextExtractor { request: HttpServletRequest ->
        authenticatedUser(request)?.let { user ->
            ToggleRequestContext(
                userId = user.id,
                rolloutKey = user.id,
                cohort = deploymentCohort(),
                attributes = user.attributes,
            )
        }
    },
    networkOptions = NetworkContextOptions(
        trustedProxyRanges = listOf("10.0.0.0/8", "2001:db8::/32"),
        countryResolver = CountryResolver { clientIp -> localGeoIp(clientIp) },
    ),
)

class ToToggleContextFilter : Filter {
    override fun doFilter(request: ServletRequest, response: ServletResponse, chain: FilterChain) {
        val http = request as? HttpServletRequest ?: return chain.doFilter(request, response)
        adapter.withRequest(http) { chain.doFilter(request, response) }
    }
}
```

Configure the client once with `.contextResolver(resolver)`. `NetworkContext` uses the socket
address by default. It honors `Forwarded`, `X-Forwarded-For`, and an edge country header only
when the direct peer matches an explicitly configured IP/CIDR allowlist. The optional local GeoIP
resolver receives the effective client IP and must not make network calls. Invalid, unavailable,
or untrusted country data is omitted, so country rules fail closed.

### Security and migration

Build `ToggleRequestContext` from verified authentication and deployment state, never directly
from a request header, query parameter, or body. Keep `trustedProxyRanges` restricted to proxies
operated directly in front of the service; an empty list intentionally ignores forwarded values.
The former `isActive(path, parameter)` overload is removed with no compatibility path. Configure
the resolver and call only `client.isActive(path)` while its request scope is open.

`RequestContextResolver` is thread-bound: do not use it for reactive handlers, coroutines, async
Servlet dispatch, or executor-hopped work. Those runtimes need a resolver backed by their own
request context. See the shared [context adapter security and migration guide](../docs/context-adapter-security.md)
for the IP/country trust model and fail-closed behavior.

If either adapter extractor fails, the SDK supplies no values from that extractor; contextual
rules therefore fail closed. The local GeoIP resolver receives the resolved client IP and must
not make network calls.

### Synchronous MVC interceptor

For a synchronous MVC interceptor, retain the `RequestContextScope` from `preHandle` and close it
in `afterCompletion`. A Servlet filter is preferred because it automatically cleans up on every
exception. Do not use this ThreadLocal resolver for reactive handlers, coroutines, Servlet async
dispatch, or work submitted to another executor; provide a resolver backed by that framework's
request context instead.

```kotlin
override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
    request.setAttribute(CONTEXT_SCOPE, resolver.openContext(contextForAuthenticatedUser(request), networkValuesFor(request)))
    return true
}

override fun afterCompletion(request: HttpServletRequest, response: HttpServletResponse, handler: Any, exception: Exception?) {
    (request.getAttribute(CONTEXT_SCOPE) as? AutoCloseable)?.close()
}
```

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
# Environment variables (all optional, safe defaults)
export GIN_MODE=release
export DB_PATH=./db/toggles.db
export SERVER_PORT=3056
export COOKIE_SECURE=true                              # default; only set to false for local HTTP-only dev

# TLS (optional) — set BOTH to terminate HTTPS directly in the binary instead of behind a reverse
# proxy. Setting only one of the two fails the server at boot with a clear error, rather than
# silently falling back to plain HTTP when HTTPS was actually intended.
export TLS_CERT_FILE=/etc/totoggle/tls/cert.pem
export TLS_KEY_FILE=/etc/totoggle/tls/key.pem
```

### Client Configuration
```kotlin
val config = ToToggleConfig.builder()
    .applicationName("my-app")
    .serverUrl("https://your-server.com")
    .secretKey("sk_your_secret_key")
    .refreshInterval(Duration.ofMinutes(5))
    .refreshBackoffMax(Duration.ofMinutes(80))
    .connectionTimeout(Duration.ofSeconds(10))
    .enableOfflineMode(true)
    .logLevel(LogLevel.INFO)
    // Zone used to evaluate "time" activation rules — defaults to the JVM's zone; set this
    // explicitly if it doesn't match the server's, since a client SDK has no way to know that
    // on its own.
    .timeZone(ZoneId.of("America/Sao_Paulo"))
    .build()
```

### Efficient catalogue synchronization

The client retains the HTTP `ETag` returned for a catalogue and sends it as `If-None-Match` on
the next refresh. A bodyless `304 Not Modified` keeps the current snapshot and revision, updates
freshness, and resets the retry sequence. A `200` replaces the snapshot; its optional
`application.revision` is diagnostic metadata only. `ETag` and revision values are never logged.

Background refresh uses bounded exponential backoff with jitter after failures and returns to the
configured base interval after `200` or `304`. Polling is the supported synchronization transport:
SSE is intentionally not enabled because the public SDK authentication contract uses the secret
header and must retain the same authenticated polling fallback.

### Observability

Everything the client tracks is available without any extra dependency (no Micrometer/StatsD
required — the SDK stays dependency-light; wire it into whatever your service already uses):

```kotlin
val client = ToToggleClient(config)

// Optional: react to refresh/evaluation events (e.g. push into your own metrics registry).
// A listener that throws is caught and logged — it can never break evaluation or refresh.
client.addMetricsListener(object : ToToggleMetricsListener {
    override fun onRefreshSuccess(toggleCount: Int) {
        myMetrics.gauge("totoggle.cache.size", toggleCount)
    }
    override fun onRefreshFailure(error: Exception, consecutiveFailures: Int) {
        myMetrics.counter("totoggle.refresh.failures").increment()
        if (consecutiveFailures >= 5) alerting.page("ToToggle server unreachable for a while")
    }
    override fun onEvaluation(path: String, result: Boolean) {
        myMetrics.counter("totoggle.evaluations", "path", path, "result", result.toString()).increment()
    }
})

client.start()

// Health/staleness — isHealthy() is false if the cache is stale (no successful refresh in more
// than 2x the refresh interval), not just "has some data": with enableOfflineMode=true, a client
// can keep answering isActive() from increasingly old data if the server has been unreachable for
// a while, so isHealthy()/isStale() are how you'd wire that into a liveness/readiness check.
client.isHealthy()                     // started, not shut down, has data, and not stale
client.isStale()                       // no successful refresh in the last 2x refreshInterval
client.getConsecutiveFailureCount()    // resets to 0 on the next successful refresh
client.getLastErrorTime()              // Instant of the last failure, or null
client.getCacheInfo()                  // human-readable summary of all of the above
```

## 📚 Documentation

- [Server Documentation](../server/README.md) - Complete server setup and API reference
- [Client Library Documentation](README.md) - Java/Kotlin client usage guide
- [API Reference](../server/README.md#-api-reference) - Complete API documentation

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

This project is licensed under the **ToToggle License 1.0** (Apache License 2.0 plus a
commercial-use attribution clause) - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Gin](https://github.com/gin-gonic/gin) - HTTP web framework for Go
- [GORM](https://gorm.io/) - ORM library for Go
- [OkHttp](https://square.github.io/okhttp/) - HTTP client for Kotlin/Java
- [Jackson](https://github.com/FasterXML/jackson) - JSON processing for Java

---

**Made by Manoel Medeiros**

For questions, issues, or contributions, please open an issue on GitHub.
