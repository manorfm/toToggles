package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	config, err := LoadConfigFromEnv()
	if err != nil {
		log.Print("stress Go runner configuration rejected")
		os.Exit(1)
	}
	runner, err := NewRunner(config)
	if err != nil {
		log.Print("stress Go runner startup failed")
		os.Exit(1)
	}
	server := &http.Server{Addr: listenAddress(config), Handler: runner.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second}

	go func() {
		if serveErr := server.ListenAndServe(); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			log.Print("stress Go runner stopped unexpectedly")
		}
	}()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	<-signals
	shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownContext)
	runner.Close(shutdownContext)
}
