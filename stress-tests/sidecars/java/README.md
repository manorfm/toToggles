# Java SDK stress sidecar

This loopback-only process allows Gatling to measure real Java SDK evaluation, including cached
catalogue reads, request-context scoping, and trusted proxy network extraction. It is not an
application API and must never be exposed outside the load-test host.

Start it with explicit server credentials (they are not printed):

```bash
STRESS_SERVER_URL=http://127.0.0.1:3056 \
STRESS_SECRET_KEY=sk_example \
./gradlew runJavaSdkSidecar
```

It binds to `127.0.0.1:19093` by default. `STRESS_JAVA_SIDECAR_HOST`,
`STRESS_JAVA_SIDECAR_PORT`, and `STRESS_JAVA_SIDECAR_WORKERS` are optional. The host is validated
as loopback-only. The catalogue URL is also loopback-only unless the operator explicitly sets
`ALLOW_NON_LOOPBACK_STRESS_TARGETS=yes`. Stop the process with `SIGTERM`/`Ctrl-C`; it stops the HTTP
executor and the SDK.

`POST /evaluate` accepts exactly this JSON contract:

```json
{
  "path": "payments.card",
  "context": {
    "userId": "user-42",
    "rolloutKey": "user-42",
    "cohort": "beta",
    "attributes": { "plan": "pro" }
  }
}
```

It returns `{"active":true}` or `{"active":false}`. Application context is scoped through
`HttpRequestContextAdapter`; the test request's `Forwarded`, `X-Forwarded-For`, and
`CF-IPCountry` headers exercise IP/country rules through a loopback-trusted proxy boundary.
Malformed input receives a generic error and is never echoed.
