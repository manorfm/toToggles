package config

import (
	"os"
	"strconv"
	"strings"
)

const (
	defaultServerPort = "3056"
	defaultDBPath     = "./db/toggles.db"
)

// CookieSecure reporta se os cookies de sessão devem exigir HTTPS (flag `Secure`). Default
// `true` — seguro por padrão; só desliga explicitamente pra dev local sem HTTPS via
// COOKIE_SECURE=false.
func CookieSecure() bool {
	value := os.Getenv("COOKIE_SECURE")
	if value == "" {
		return true
	}
	secure, err := strconv.ParseBool(value)
	if err != nil {
		return true
	}
	return secure
}

// AllowedOrigins devolve a allowlist de CORS a partir de CORS_ALLOWED_ORIGINS (separado por
// vírgula). Vazio por padrão — nenhuma requisição cross-origin com credenciais é permitida a
// menos que configurado explicitamente.
func AllowedOrigins() []string {
	value := os.Getenv("CORS_ALLOWED_ORIGINS")
	if value == "" {
		return nil
	}

	parts := strings.Split(value, ",")
	origins := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			origins = append(origins, p)
		}
	}
	return origins
}

// ServerPort devolve a porta em que o servidor HTTP deve escutar (SERVER_PORT), com o mesmo
// default (3056) que já estava hardcoded em router.go.
func ServerPort() string {
	if value := os.Getenv("SERVER_PORT"); value != "" {
		return value
	}
	return defaultServerPort
}

// DBPath devolve o caminho do arquivo SQLite (DB_PATH), com o mesmo default que já estava
// hardcoded em db.go.
func DBPath() string {
	if value := os.Getenv("DB_PATH"); value != "" {
		return value
	}
	return defaultDBPath
}
