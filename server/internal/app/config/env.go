package config

import (
	"errors"
	"os"
	"strconv"
)

const (
	defaultServerPort = "3056"
	defaultDBPath     = "./db/toggles.db"
)

var errIncompleteTLSConfig = errors.New("both TLS_CERT_FILE and TLS_KEY_FILE must be set together (only one was provided)")

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

// TLSCertFile/TLSKeyFile apontam pro certificado/chave (TLS_CERT_FILE/TLS_KEY_FILE) — vazios por
// padrão, o que mantém o comportamento atual (HTTP puro, pra quem já roda atrás de um proxy
// reverso que termina TLS). Setar os dois liga TLS direto no binário (ver router.Initialize).
// Setar só um dos dois é tratado como configuração incompleta por HasTLSConfig — mais seguro
// falhar alto (erro claro no boot) do que subir em HTTP puro silenciosamente quando a intenção
// era HTTPS.
func TLSCertFile() string {
	return os.Getenv("TLS_CERT_FILE")
}

func TLSKeyFile() string {
	return os.Getenv("TLS_KEY_FILE")
}

// HasTLSConfig reporta se TLS_CERT_FILE e TLS_KEY_FILE estão configurados o suficiente pra
// ligar TLS. Retorna (true, nil) quando os dois estão setados, (false, nil) quando nenhum está
// setado (HTTP puro, intencional), e (false, err) quando só um dos dois está setado — sinal de
// configuração incompleta que merece falhar alto, não silenciosamente cair pra HTTP.
func HasTLSConfig() (bool, error) {
	cert, key := TLSCertFile(), TLSKeyFile()
	switch {
	case cert != "" && key != "":
		return true, nil
	case cert == "" && key == "":
		return false, nil
	default:
		return false, errIncompleteTLSConfig
	}
}
