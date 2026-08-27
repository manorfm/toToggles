package config

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestInit(t *testing.T) {
	// Testa a inicialização da configuração
	err := Init()
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
}

func TestGetDatabase(t *testing.T) {
	// Inicializa primeiro
	err := Init()
	if err != nil {
		t.Fatalf("Failed to init: %v", err)
	}

	db := GetDatabase()
	if db == nil {
		t.Error("Expected database to be initialized, got nil")
	}
}

func TestGetLogger(t *testing.T) {
	logger := GetLogger("test")
	if logger == nil {
		t.Error("Expected logger to be initialized, got nil")
	}
}

func TestVerifyDbFile(t *testing.T) {
	// Testa a verificação do arquivo de banco de dados
	err := verifyDbFile("test.db")
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
}

func TestInitializeDB(t *testing.T) {
	// Testa a inicialização do banco de dados
	db, err := InitializeDB()
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if db == nil {
		t.Error("Expected database to be initialized, got nil")
	}
}

func TestNewLogger(t *testing.T) {
	logger := NewLogger("test")
	if logger == nil {
		t.Error("Expected logger to be initialized, got nil")
	}
}

func TestLoggerMethods(t *testing.T) {
	logger := NewLogger("test")

	// Testa todos os métodos do logger
	logger.Debug("debug message")
	logger.Info("info message")
	logger.Warn("warning message")
	logger.Error("error message")

	logger.Debugf("debug message: %s", "test")
	logger.Infof("info message: %s", "test")
	logger.Warnf("warning message: %s", "test")
	logger.Errorf("error message: %s", "test")
}

func TestLogger_WritesValidJSONWithLevelMessageAndComponent(t *testing.T) {
	var buf bytes.Buffer
	logger := newLoggerWithWriter("my-component", &buf)

	logger.Info("hello world")

	var entry map[string]interface{}
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("expected valid JSON output, got %q: %v", buf.String(), err)
	}
	if entry["msg"] != "hello world" {
		t.Errorf("expected msg='hello world', got %v", entry["msg"])
	}
	if entry["level"] != "INFO" {
		t.Errorf("expected level='INFO', got %v", entry["level"])
	}
	if entry["component"] != "my-component" {
		t.Errorf("expected component='my-component', got %v", entry["component"])
	}
}

func TestLogger_FormattedVariantsInterpolateBeforeLogging(t *testing.T) {
	var buf bytes.Buffer
	logger := newLoggerWithWriter("test", &buf)

	logger.Errorf("failed for user %s: %v", "alice", "boom")

	var entry map[string]interface{}
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("expected valid JSON output: %v", err)
	}
	if entry["msg"] != "failed for user alice: boom" {
		t.Errorf("expected the format string to be interpolated, got %v", entry["msg"])
	}
	if entry["level"] != "ERROR" {
		t.Errorf("expected level='ERROR', got %v", entry["level"])
	}
}

func TestLogger_EachCallProducesOneJSONLine(t *testing.T) {
	var buf bytes.Buffer
	logger := newLoggerWithWriter("test", &buf)

	logger.Debug("one")
	logger.Warn("two")

	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("expected 2 lines, got %d: %q", len(lines), buf.String())
	}
	for _, line := range lines {
		var entry map[string]interface{}
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Errorf("expected each line to be valid JSON on its own, line %q: %v", line, err)
		}
	}
}
