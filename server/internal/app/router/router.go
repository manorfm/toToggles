package router

import (
	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/config"
	"github.com/manorfm/totoogle/internal/app/handler"
)

func Initialize() {
	router := gin.Default()

	// Inicializa os handlers
	handler.InitHandlers(config.GetDatabase())

	Init(router)

	// TLS_CERT_FILE/TLS_KEY_FILE ligam HTTPS direto no binário; sem os dois, mantém HTTP puro
	// (comportamento de sempre — válido pra quem já roda atrás de um proxy reverso que termina
	// TLS). Só um dos dois setado é tratado como erro de configuração, não cai silenciosamente
	// pra HTTP — mais seguro falhar alto no boot do que subir sem TLS quando a intenção era ligá-lo.
	hasTLS, err := config.HasTLSConfig()
	if err != nil {
		logger := config.GetLogger("router")
		logger.Errorf("TLS configuration error: %v", err)
		return
	}

	addr := ":" + config.ServerPort()
	if hasTLS {
		router.RunTLS(addr, config.TLSCertFile(), config.TLSKeyFile())
	} else {
		router.Run(addr)
	}
}
