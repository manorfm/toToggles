package config

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
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

// verifyDbFile must create the configured path's OWN parent directory — not a hardcoded "./db"
// — otherwise a DB_PATH outside "./db/" (e.g. docker-compose.yml's DB_PATH=/root/db/toggles.db,
// pointed at a mounted volume) creates the wrong directory and os.Create on the real path fails.
func TestVerifyDbFile_CreatesTheGivenPathsOwnParentDirectory(t *testing.T) {
	GetLogger("test") // verifyDbFile logs via the package-level logger; ensure it's initialized

	tmp := t.TempDir()
	dbPath := filepath.Join(tmp, "nested", "sub", "toggles.db")

	if err := verifyDbFile(dbPath); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	info, err := os.Stat(dbPath)
	if err != nil {
		t.Fatalf("expected the db file to exist at %s, got %v", dbPath, err)
	}
	if info.IsDir() {
		t.Fatalf("expected %s to be a file, not a directory", dbPath)
	}
}

func TestVerifyDbFile_LeavesAnExistingFileUntouched(t *testing.T) {
	GetLogger("test")

	tmp := t.TempDir()
	dbPath := filepath.Join(tmp, "toggles.db")
	if err := os.WriteFile(dbPath, []byte("existing-data"), 0o600); err != nil {
		t.Fatalf("failed to seed existing file: %v", err)
	}

	if err := verifyDbFile(dbPath); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	data, err := os.ReadFile(dbPath)
	if err != nil {
		t.Fatalf("expected to read back the file, got %v", err)
	}
	if string(data) != "existing-data" {
		t.Fatalf("expected the existing file to be left untouched, got contents %q", data)
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

// InitializeDB must apply the embedded goose migrations itself — the production Docker image
// (FROM scratch) has no goose CLI and nothing else runs `make migrate-up` inside it, so without
// this the binary starts against a schema-less SQLite file and every query fails with
// "no such table: ...". Confirmed live against a real built image before this fix existed.
func TestInitializeDB_AppliesEmbeddedMigrations(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("DB_PATH", filepath.Join(tmp, "migrated.db"))

	db, err := InitializeDB()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("failed to get underlying sql.DB: %v", err)
	}

	for _, table := range []string{"users", "sessions", "applications", "toggles", "teams"} {
		var count int
		row := sqlDB.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", table)
		if err := row.Scan(&count); err != nil {
			t.Fatalf("query failed for table %s: %v", table, err)
		}
		if count != 1 {
			t.Errorf("expected table %q to exist after InitializeDB (migrations applied), it does not", table)
		}
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
