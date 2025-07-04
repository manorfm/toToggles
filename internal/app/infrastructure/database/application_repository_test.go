package database

import (
	"testing"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	// Auto migrate
	err = db.AutoMigrate(&entity.Application{}, &entity.Toggle{})
	if err != nil {
		t.Fatalf("Failed to migrate test database: %v", err)
	}

	return db
}

func TestApplicationRepository_Create(t *testing.T) {
	db := setupTestDB(t)
	repo := NewApplicationRepository(db)

	app := entity.NewApplication("Test Application")

	err := repo.Create(app)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if app.ID == "" {
		t.Error("Expected ID to be generated")
	}
}

func TestApplicationRepository_GetByID(t *testing.T) {
	db := setupTestDB(t)
	repo := NewApplicationRepository(db)

	// Create test application
	app := entity.NewApplication("Test Application")
	err := repo.Create(app)
	if err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	// Test successful retrieval
	retrieved, err := repo.GetByID(app.ID)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if retrieved.ID != app.ID {
		t.Errorf("Expected ID %s, got %s", app.ID, retrieved.ID)
	}

	if retrieved.Name != app.Name {
		t.Errorf("Expected name %s, got %s", app.Name, retrieved.Name)
	}

	// Test not found
	_, err = repo.GetByID("nonexistent")
	if err == nil {
		t.Error("Expected error for nonexistent ID")
	}
}

func TestApplicationRepository_GetAll(t *testing.T) {
	db := setupTestDB(t)
	repo := NewApplicationRepository(db)

	// Create test applications
	app1 := entity.NewApplication("App 1")
	app2 := entity.NewApplication("App 2")

	err := repo.Create(app1)
	if err != nil {
		t.Fatalf("Failed to create test application 1: %v", err)
	}

	err = repo.Create(app2)
	if err != nil {
		t.Fatalf("Failed to create test application 2: %v", err)
	}

	// Test retrieval
	apps, err := repo.GetAll()
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if len(apps) != 2 {
		t.Errorf("Expected 2 applications, got %d", len(apps))
	}
}

func TestApplicationRepository_Update(t *testing.T) {
	db := setupTestDB(t)
	repo := NewApplicationRepository(db)

	// Create test application
	app := entity.NewApplication("Original Name")
	err := repo.Create(app)
	if err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	// Update application
	app.Name = "Updated Name"
	err = repo.Update(app)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	// Verify update
	retrieved, err := repo.GetByID(app.ID)
	if err != nil {
		t.Fatalf("Failed to retrieve updated application: %v", err)
	}

	if retrieved.Name != "Updated Name" {
		t.Errorf("Expected name 'Updated Name', got %s", retrieved.Name)
	}
}

func TestApplicationRepository_Delete(t *testing.T) {
	db := setupTestDB(t)
	repo := NewApplicationRepository(db)

	// Create test application
	app := entity.NewApplication("Test Application")
	err := repo.Create(app)
	if err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	// Delete application
	err = repo.Delete(app.ID)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	// Verify deletion
	_, err = repo.GetByID(app.ID)
	if err == nil {
		t.Error("Expected error for deleted application")
	}
}

func TestApplicationRepository_Exists(t *testing.T) {
	db := setupTestDB(t)
	repo := NewApplicationRepository(db)

	// Create test application
	app := entity.NewApplication("Test Application")
	err := repo.Create(app)
	if err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	// Test existing application
	exists, err := repo.Exists(app.ID)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if !exists {
		t.Error("Expected application to exist")
	}

	// Test nonexistent application
	exists, err = repo.Exists("nonexistent")
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if exists {
		t.Error("Expected application to not exist")
	}
}
