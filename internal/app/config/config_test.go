package config

import (
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
