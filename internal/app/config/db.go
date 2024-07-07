package config

import (
	"os"

	"github.com/manorfm/totoogle/internal/app/schemas"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func verifyDbFile(dbPath string) error {
	_, err := os.Stat(dbPath)
	if os.IsNotExist(err) {
		logger.Info("database file not found, creating...")
		// Create database file and directory
		err = os.MkdirAll("./db", os.ModePerm)
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

func InitializeDB() (*gorm.DB, error) {
	logger := GetLogger("database")
	dbPath := "./db/toggles.db"

	err := verifyDbFile(dbPath)
	if err != nil {
		logger.Errorf("database opening error: %v", err)
		return nil, err
	}

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})

	if err != nil {
		logger.Errorf("database opening error: %v", err)
		return nil, err
	}

	// Migrate Schema
	err = db.AutoMigrate(&schemas.Toggle{}, &schemas.ToggleAudit{})

	if err != nil {
		logger.Errorf("database automigration error: %v", err)
		return nil, err
	}

	return db, nil
}
