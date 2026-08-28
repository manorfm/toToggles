package config

import (
	"os"
	"path/filepath"

	"github.com/manorfm/totoogle/db/migrations"
	"github.com/pressly/goose/v3"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func verifyDbFile(dbPath string) error {
	_, err := os.Stat(dbPath)
	if os.IsNotExist(err) {
		logger.Info("database file not found, creating...")
		// Create the database file's own parent directory — dbPath is caller-configured
		// (DB_PATH) and isn't always under "./db" (e.g. docker-compose.yml points it at a
		// mounted volume elsewhere).
		err = os.MkdirAll(filepath.Dir(dbPath), os.ModePerm)
		if err != nil {
			return err
		}
		file, err := os.Create(dbPath)
		if err != nil {
			return err
		}
		file.Close()
	}
	return nil
}

// applyMigrations runs the embedded goose migrations against db, creating/advancing the schema.
// Applied at every startup (not just via the external `make migrate-up` CLI step) so the binary
// is self-sufficient in any deployment — notably the `scratch`-based production Docker image,
// which has no goose CLI and no way to run that step inside the container at all. Idempotent:
// goose only applies migrations not already recorded in its own tracking table, so this is a
// harmless no-op on a database that's already up to date (e.g. local dev after `make migrate-up`
// already ran).
func applyMigrations(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}

	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("sqlite3"); err != nil {
		return err
	}
	return goose.Up(sqlDB, ".")
}

func InitializeDB() (*gorm.DB, error) {
	logger := GetLogger("database")
	dbPath := DBPath()

	err := verifyDbFile(dbPath)
	if err != nil {
		logger.Errorf("creating database error: %v", err)
		return nil, err
	}

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		logger.Errorf("database opening error: %v", err)
		return nil, err
	}

	if err := applyMigrations(db); err != nil {
		logger.Errorf("applying migrations error: %v", err)
		return nil, err
	}

	return db, nil
}
