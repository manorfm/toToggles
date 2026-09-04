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

// v2.6 §4.1: Delete virou soft-delete (Toggle.DeletedAt) — a linha continua fisicamente no banco,
// só some das queries normais. Confirma que Delete() por trás de GetByID some com o registro nas
// leituras normais mas GetByIDUnscoped ainda o enxerga.
func TestToggleRepository_Delete_IsSoftDelete(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)
	appRepo := NewApplicationRepository(db)
	app := entity.NewApplication("Test App")
	if err := appRepo.Create(app); err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	toggle := entity.NewToggle("test", true, "test.feature", 0, nil, app.ID)
	if err := repo.Create(toggle); err != nil {
		t.Fatalf("Failed to create test toggle: %v", err)
	}

	if err := repo.Delete(toggle.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := repo.GetByID(toggle.ID); err == nil {
		t.Error("expected GetByID to no longer see the soft-deleted toggle")
	}

	unscoped, err := repo.GetByIDUnscoped(toggle.ID)
	if err != nil {
		t.Fatalf("expected GetByIDUnscoped to still find the soft-deleted toggle, got error: %v", err)
	}
	if !unscoped.DeletedAt.Valid {
		t.Error("expected DeletedAt to be set")
	}
}

func TestToggleRepository_MarkDeletionMeta(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)
	appRepo := NewApplicationRepository(db)
	app := entity.NewApplication("Test App")
	if err := appRepo.Create(app); err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	toggle := entity.NewToggle("test", true, "test.feature", 0, nil, app.ID)
	if err := repo.Create(toggle); err != nil {
		t.Fatalf("Failed to create test toggle: %v", err)
	}

	if err := repo.MarkDeletionMeta(toggle.ID, "user-123"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := repo.Delete(toggle.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	archived, err := repo.GetByIDUnscoped(toggle.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if archived.DeletedBy == nil || *archived.DeletedBy != "user-123" {
		t.Errorf("expected DeletedBy 'user-123', got %v", archived.DeletedBy)
	}
	if !archived.ArchivedRoot {
		t.Error("expected ArchivedRoot to be true")
	}
}

func TestToggleRepository_GetArchivedRootsByAppID(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)
	appRepo := NewApplicationRepository(db)
	app := entity.NewApplication("Test App")
	if err := appRepo.Create(app); err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	// parent (deleted, archived root) -> child (deleted, cascaded, NOT its own archived root)
	parent := entity.NewToggle("parent", true, "parent", 0, nil, app.ID)
	if err := repo.Create(parent); err != nil {
		t.Fatalf("Failed to create parent: %v", err)
	}
	child := entity.NewToggle("child", true, "parent.child", 1, &parent.ID, app.ID)
	if err := repo.Create(child); err != nil {
		t.Fatalf("Failed to create child: %v", err)
	}
	// unrelated, still-active toggle — must never appear in the archived list
	active := entity.NewToggle("active", true, "active", 0, nil, app.ID)
	if err := repo.Create(active); err != nil {
		t.Fatalf("Failed to create active toggle: %v", err)
	}

	if err := repo.MarkDeletionMeta(parent.ID, "user-123"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := repo.Delete(parent.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	archived, err := repo.GetArchivedRootsByAppID(app.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(archived) != 1 || archived[0].ID != parent.ID {
		t.Fatalf("expected exactly [parent], got %+v", archived)
	}
}

func TestToggleRepository_Restore(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)
	appRepo := NewApplicationRepository(db)
	app := entity.NewApplication("Test App")
	if err := appRepo.Create(app); err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	parent := entity.NewToggle("parent", true, "parent", 0, nil, app.ID)
	if err := repo.Create(parent); err != nil {
		t.Fatalf("Failed to create parent: %v", err)
	}
	child := entity.NewToggle("child", true, "parent.child", 1, &parent.ID, app.ID)
	if err := repo.Create(child); err != nil {
		t.Fatalf("Failed to create child: %v", err)
	}

	if err := repo.MarkDeletionMeta(parent.ID, "user-123"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := repo.Delete(parent.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if err := repo.Restore(parent.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	restoredParent, err := repo.GetByID(parent.ID)
	if err != nil {
		t.Fatalf("expected parent to be visible again via GetByID: %v", err)
	}
	if restoredParent.ArchivedRoot {
		t.Error("expected ArchivedRoot to be cleared after restore")
	}
	if restoredParent.DeletedBy != nil {
		t.Error("expected DeletedBy to be cleared after restore")
	}

	restoredChild, err := repo.GetByID(child.ID)
	if err != nil {
		t.Fatalf("expected child to be visible again via GetByID: %v", err)
	}
	if restoredChild.ParentID == nil || *restoredChild.ParentID != parent.ID {
		t.Error("expected child to still be parented under the restored parent")
	}
}

func TestToggleRepository_GetChildrenUnscoped(t *testing.T) {
	db := setupTestDB(t)
	repo := NewToggleRepository(db)
	appRepo := NewApplicationRepository(db)
	app := entity.NewApplication("Test App")
	if err := appRepo.Create(app); err != nil {
		t.Fatalf("Failed to create test application: %v", err)
	}

	parent := entity.NewToggle("parent", true, "parent", 0, nil, app.ID)
	if err := repo.Create(parent); err != nil {
		t.Fatalf("Failed to create parent: %v", err)
	}
	child := entity.NewToggle("child", true, "parent.child", 1, &parent.ID, app.ID)
	if err := repo.Create(child); err != nil {
		t.Fatalf("Failed to create child: %v", err)
	}

	if err := repo.MarkDeletionMeta(parent.ID, "user-123"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := repo.Delete(parent.ID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// GetChildren (normal) no longer sees it — GetChildrenUnscoped still does.
	scoped, err := repo.GetChildren(parent.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(scoped) != 0 {
		t.Errorf("expected GetChildren to hide the soft-deleted child, got %+v", scoped)
	}

	unscoped, err := repo.GetChildrenUnscoped(parent.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(unscoped) != 1 || unscoped[0].ID != child.ID {
		t.Fatalf("expected GetChildrenUnscoped to still find the soft-deleted child, got %+v", unscoped)
	}
}
