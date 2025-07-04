package database

import (
	"testing"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

func TestToggleRepository_Create(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)

	// Create application first
	appRepo := NewApplicationRepository(db)
	app := entity.NewApplication("Test App")
	err := appRepo.Create(app)
	if err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	toggle := entity.NewToggle("test", true, true, "test.feature", 1, nil, app.ID)

	err = repo.Create(toggle)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if toggle.ID == "" {
		t.Error("Expected ID to be generated")
	}
}

func TestToggleRepository_GetByPath(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)

	// Create application first
	appRepo := NewApplicationRepository(db)
	app := entity.NewApplication("Test App")
	err := appRepo.Create(app)
	if err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	// Create toggle
	toggle := entity.NewToggle("test", true, true, "test.feature", 1, nil, app.ID)
	err = repo.Create(toggle)
	if err != nil {
		t.Fatalf("Failed to create test toggle: %v", err)
	}

	// Test successful retrieval
	retrieved, err := repo.GetByPath("test.feature", app.ID)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if retrieved.ID != toggle.ID {
		t.Errorf("Expected ID %s, got %s", toggle.ID, retrieved.ID)
	}

	if retrieved.Path != toggle.Path {
		t.Errorf("Expected path %s, got %s", toggle.Path, retrieved.Path)
	}

	// Test not found
	_, err = repo.GetByPath("nonexistent.feature", app.ID)
	if err == nil {
		t.Error("Expected error for nonexistent path")
	}
}

func TestToggleRepository_GetByAppID(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)

	// Create application first
	appRepo := NewApplicationRepository(db)
	app := entity.NewApplication("Test App")
	err := appRepo.Create(app)
	if err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	// Create toggles
	toggle1 := entity.NewToggle("test1", true, true, "test1.feature", 1, nil, app.ID)
	toggle2 := entity.NewToggle("test2", false, true, "test2.feature", 1, nil, app.ID)

	err = repo.Create(toggle1)
	if err != nil {
		t.Fatalf("Failed to create test toggle 1: %v", err)
	}

	err = repo.Create(toggle2)
	if err != nil {
		t.Fatalf("Failed to create test toggle 2: %v", err)
	}

	// Test retrieval
	toggles, err := repo.GetByAppID(app.ID)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if len(toggles) != 2 {
		t.Errorf("Expected 2 toggles, got %d", len(toggles))
	}
}

func TestToggleRepository_Update(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)

	// Create application first
	appRepo := NewApplicationRepository(db)
	app := entity.NewApplication("Test App")
	err := appRepo.Create(app)
	if err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	// Create toggle
	toggle := entity.NewToggle("test", true, true, "test.feature", 1, nil, app.ID)
	err = repo.Create(toggle)
	if err != nil {
		t.Fatalf("Failed to create test toggle: %v", err)
	}

	// Update toggle
	toggle.Enabled = false
	err = repo.Update(toggle)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	// Verify update
	retrieved, err := repo.GetByPath("test.feature", app.ID)
	if err != nil {
		t.Fatalf("Failed to retrieve updated toggle: %v", err)
	}

	if retrieved.Enabled {
		t.Error("Expected toggle to be disabled")
	}
}

func TestToggleRepository_DeleteByPath(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)

	// Create application first
	appRepo := NewApplicationRepository(db)
	app := entity.NewApplication("Test App")
	err := appRepo.Create(app)
	if err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	// Create toggle
	toggle := entity.NewToggle("test", true, true, "test.feature", 1, nil, app.ID)
	err = repo.Create(toggle)
	if err != nil {
		t.Fatalf("Failed to create test toggle: %v", err)
	}

	// Delete toggle
	err = repo.DeleteByPath("test.feature", app.ID)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	// Verify deletion
	_, err = repo.GetByPath("test.feature", app.ID)
	if err == nil {
		t.Error("Expected error for deleted toggle")
	}
}

func TestToggleRepository_Exists(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)

	// Create application first
	appRepo := NewApplicationRepository(db)
	app := entity.NewApplication("Test App")
	err := appRepo.Create(app)
	if err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	// Create toggle
	toggle := entity.NewToggle("test", true, true, "test.feature", 1, nil, app.ID)
	err = repo.Create(toggle)
	if err != nil {
		t.Fatalf("Failed to create test toggle: %v", err)
	}

	// Test existing toggle
	exists, err := repo.Exists("test.feature", app.ID)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if !exists {
		t.Error("Expected toggle to exist")
	}

	// Test nonexistent toggle
	exists, err = repo.Exists("nonexistent.feature", app.ID)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	if exists {
		t.Error("Expected toggle to not exist")
	}
}
