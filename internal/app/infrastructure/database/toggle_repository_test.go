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

	toggle := entity.NewToggle("test", true, "test.feature", 1, nil, app.ID)

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
	toggle := entity.NewToggle("test", true, "test.feature", 1, nil, app.ID)
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
	toggle1 := entity.NewToggle("test1", true, "test1.feature", 1, nil, app.ID)
	toggle2 := entity.NewToggle("test2", false, "test2.feature", 1, nil, app.ID)

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
	toggle := entity.NewToggle("test", true, "test.feature", 1, nil, app.ID)
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
	toggle := entity.NewToggle("test", true, "test.feature", 1, nil, app.ID)
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
	toggle := entity.NewToggle("test", true, "test.feature", 1, nil, app.ID)
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

func TestToggleRepository_GetByID(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)

	// Criar toggle de teste
	toggle := &entity.Toggle{
		ID:      "test-toggle",
		Path:    "test.feature",
		AppID:   "test-app",
		Value:   "test",
		Level:   0,
		Enabled: true,
	}
	err := repo.Create(toggle)
	if err != nil {
		t.Fatalf("Failed to create toggle: %v", err)
	}

	// Testar busca por ID
	found, err := repo.GetByID("test-toggle")
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if found == nil {
		t.Error("Expected toggle to be found")
	}
	if found.ID != "test-toggle" {
		t.Errorf("Expected ID 'test-toggle', got %s", found.ID)
	}

	// Testar toggle inexistente
	_, err = repo.GetByID("nonexistent")
	if err == nil {
		t.Error("Expected error for nonexistent toggle")
	}
}

func TestToggleRepository_GetHierarchyByAppID(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)

	// Criar toggles de teste com hierarquia
	parent := &entity.Toggle{
		ID:      "parent",
		Path:    "parent",
		AppID:   "test-app",
		Value:   "parent",
		Level:   0,
		Enabled: true,
	}
	err := repo.Create(parent)
	if err != nil {
		t.Fatalf("Failed to create parent toggle: %v", err)
	}

	child := &entity.Toggle{
		ID:       "child",
		Path:     "parent.child",
		AppID:    "test-app",
		Value:    "child",
		Level:    1,
		ParentID: &parent.ID,
		Enabled:  true,
	}
	err = repo.Create(child)
	if err != nil {
		t.Fatalf("Failed to create child toggle: %v", err)
	}

	// Testar busca hierárquica
	toggles, err := repo.GetHierarchyByAppID("test-app")
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if len(toggles) != 2 {
		t.Errorf("Expected 2 toggles, got %d", len(toggles))
	}
}

func TestToggleRepository_Delete(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)

	// Criar toggle de teste
	toggle := &entity.Toggle{
		ID:      "test-toggle",
		Path:    "test.feature",
		AppID:   "test-app",
		Value:   "test",
		Level:   0,
		Enabled: true,
	}
	err := repo.Create(toggle)
	if err != nil {
		t.Fatalf("Failed to create toggle: %v", err)
	}

	// Testar remoção
	err = repo.Delete("test-toggle")
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	// Verificar se foi removido
	_, err = repo.GetByID("test-toggle")
	if err == nil {
		t.Error("Expected toggle to be deleted")
	}
}

func TestToggleRepository_GetChildren(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)

	// Criar toggles de teste com hierarquia
	parent := &entity.Toggle{
		ID:      "parent",
		Path:    "parent",
		AppID:   "test-app",
		Value:   "parent",
		Level:   0,
		Enabled: true,
	}
	err := repo.Create(parent)
	if err != nil {
		t.Fatalf("Failed to create parent toggle: %v", err)
	}

	child1 := &entity.Toggle{
		ID:       "child1",
		Path:     "parent.child1",
		AppID:    "test-app",
		Value:    "child1",
		Level:    1,
		ParentID: &parent.ID,
		Enabled:  true,
	}
	err = repo.Create(child1)
	if err != nil {
		t.Fatalf("Failed to create child1 toggle: %v", err)
	}

	child2 := &entity.Toggle{
		ID:       "child2",
		Path:     "parent.child2",
		AppID:    "test-app",
		Value:    "child2",
		Level:    1,
		ParentID: &parent.ID,
		Enabled:  true,
	}
	err = repo.Create(child2)
	if err != nil {
		t.Fatalf("Failed to create child2 toggle: %v", err)
	}

	// Testar busca de filhos
	children, err := repo.GetChildren("parent")
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if len(children) != 2 {
		t.Errorf("Expected 2 children, got %d", len(children))
	}

	// Testar busca de filhos de toggle sem filhos
	children, err = repo.GetChildren("child1")
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if len(children) != 0 {
		t.Errorf("Expected 0 children, got %d", len(children))
	}
}

func TestToggleRepository_DeleteWithChildren(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)

	// Criar toggles de teste com hierarquia
	parent := &entity.Toggle{
		ID:      "parent",
		Path:    "parent",
		AppID:   "test-app",
		Value:   "parent",
		Level:   0,
		Enabled: true,
	}
	err := repo.Create(parent)
	if err != nil {
		t.Fatalf("Failed to create parent toggle: %v", err)
	}

	child := &entity.Toggle{
		ID:       "child",
		Path:     "parent.child",
		AppID:    "test-app",
		Value:    "child",
		Level:    1,
		ParentID: &parent.ID,
		Enabled:  true,
	}
	err = repo.Create(child)
	if err != nil {
		t.Fatalf("Failed to create child toggle: %v", err)
	}

	// Testar remoção com filhos
	err = repo.Delete("parent")
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	// Verificar se pai e filho foram removidos
	_, err = repo.GetByID("parent")
	if err == nil {
		t.Error("Expected parent to be deleted")
	}

	_, err = repo.GetByID("child")
	if err == nil {
		t.Error("Expected child to be deleted")
	}
}

func TestToggleRepository_Delete_Cascade(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)

	// Create application first
	appRepo := NewApplicationRepository(db)
	app := entity.NewApplication("Test App")
	err := appRepo.Create(app)
	if err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	// Create parent toggle
	parent := entity.NewToggle("parent", true, "parent", 0, nil, app.ID)
	err = repo.Create(parent)
	if err != nil {
		t.Fatalf("Failed to create parent toggle: %v", err)
	}

	// Create child toggles
	child1 := entity.NewToggle("child1", true, "parent.child1", 1, &parent.ID, app.ID)
	err = repo.Create(child1)
	if err != nil {
		t.Fatalf("Failed to create child1 toggle: %v", err)
	}

	child2 := entity.NewToggle("child2", true, "parent.child2", 1, &parent.ID, app.ID)
	err = repo.Create(child2)
	if err != nil {
		t.Fatalf("Failed to create child2 toggle: %v", err)
	}

	// Create grandchild toggle
	grandchild := entity.NewToggle("grandchild", true, "parent.child1.grandchild", 2, &child1.ID, app.ID)
	err = repo.Create(grandchild)
	if err != nil {
		t.Fatalf("Failed to create grandchild toggle: %v", err)
	}

	// Delete parent toggle (should cascade to all children)
	err = repo.Delete(parent.ID)
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}

	// Verify parent was deleted
	_, err = repo.GetByID(parent.ID)
	if err == nil {
		t.Error("Expected parent toggle to be deleted")
	}

	// Verify all children were deleted
	_, err = repo.GetByID(child1.ID)
	if err == nil {
		t.Error("Expected child1 toggle to be deleted")
	}

	_, err = repo.GetByID(child2.ID)
	if err == nil {
		t.Error("Expected child2 toggle to be deleted")
	}

	_, err = repo.GetByID(grandchild.ID)
	if err == nil {
		t.Error("Expected grandchild toggle to be deleted")
	}
}
