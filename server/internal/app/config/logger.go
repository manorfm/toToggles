package config

import (
	"fmt"
	"io"
	"log/slog"
	"os"
)

// Logger é um wrapper fino sobre log/slog (stdlib desde Go 1.21, sem dependência nova — mesmo
// espírito "sem dependência pesada" do resto do server) que preserva a API antiga (Debug/Info/
// Warn/Error + variantes formatadas) pra nenhum dos ~6 call sites precisar mudar, mas agora
// escreve cada linha como JSON estruturado em vez de texto solto com prefixo — o prefixo passado
// pra NewLogger vira o campo "component" em cada linha, em vez de um prefixo textual
// ("DEBUG: ...") que uma ferramenta de agregação de log não consegue parsear de forma confiável.
type Logger struct {
	logger    *slog.Logger
	component string
}

func NewLogger(prefix string) *Logger {
	return newLoggerWithWriter(prefix, os.Stdout)
}

// newLoggerWithWriter lets tests capture and assert on the JSON output — NewLogger always writes
// to stdout in production, where log aggregators actually read from.
func newLoggerWithWriter(prefix string, w io.Writer) *Logger {
	handler := slog.NewJSONHandler(w, &slog.HandlerOptions{Level: slog.LevelDebug})
	return &Logger{
		logger:    slog.New(handler),
		component: prefix,
	}
}

func (l *Logger) Debug(v ...interface{}) {
	l.logger.Debug(fmt.Sprint(v...), "component", l.component)
}

func (l *Logger) Info(v ...interface{}) {
	l.logger.Info(fmt.Sprint(v...), "component", l.component)
}

func (l *Logger) Warn(v ...interface{}) {
	l.logger.Warn(fmt.Sprint(v...), "component", l.component)
}

func (l *Logger) Error(v ...interface{}) {
	l.logger.Error(fmt.Sprint(v...), "component", l.component)
}

func (l *Logger) Debugf(format string, v ...interface{}) {
	l.logger.Debug(fmt.Sprintf(format, v...), "component", l.component)
}

func (l *Logger) Infof(format string, v ...interface{}) {
	l.logger.Info(fmt.Sprintf(format, v...), "component", l.component)
}

func (l *Logger) Warnf(format string, v ...interface{}) {
	l.logger.Warn(fmt.Sprintf(format, v...), "component", l.component)
}

func (l *Logger) Errorf(format string, v ...interface{}) {
	l.logger.Error(fmt.Sprintf(format, v...), "component", l.component)
}
