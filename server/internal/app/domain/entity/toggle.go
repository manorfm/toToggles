package entity

import (
	"strings"
	"time"

	"gorm.io/gorm"
)

// Toggle representa um feature toggle com estrutura hierárquica
type Toggle struct {
	ID                string          `json:"id" gorm:"primaryKey;type:varchar(26)"`
	Value             string          `json:"value" gorm:"not null;type:varchar(255)"`
	Enabled           bool            `json:"enabled" gorm:"not null;default:true"`
	Path              string          `json:"path" gorm:"not null;type:varchar(1000)"`
	Level             int             `json:"level" gorm:"not null;default:0"`
	ParentID          *string         `json:"parent_id" gorm:"type:varchar(26)"`
	AppID             string          `json:"app_id" gorm:"not null;type:varchar(26)"`
	HasActivationRule bool            `json:"has_activation_rule" gorm:"default:false"`
	ActivationRule    *ActivationRule `json:"activation_rule,omitempty" gorm:"embedded;embeddedPrefix:rule_"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`

	// Reversibilidade de exclusão (v2.6 §4.1): DeletedAt é o tipo que o GORM reconhece
	// nativamente como soft-delete — toda query existente (GetByID/GetByPath/GetChildren/...)
	// passa a ignorar linhas apagadas automaticamente, e Unscoped() as revela de volta pra
	// restauração/listagem de arquivados. ArchivedRoot marca só o nó em que o usuário clicou
	// "Delete" (não toda a subárvore que foi junto em cascata) — é o que a tela "Archived" lista,
	// um item por operação de exclusão.
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
	DeletedBy    *string        `json:"deleted_by,omitempty" gorm:"type:varchar(26)"`
	ArchivedRoot bool           `json:"-" gorm:"column:archived_root;not null;default:false"`

	// Relacionamentos
	Parent   *Toggle   `json:"parent,omitempty" gorm:"foreignKey:ParentID"`
	Children []*Toggle `json:"children,omitempty" gorm:"foreignKey:ParentID"`
}

// NewToggle cria uma nova instância de Toggle
func NewToggle(value string, enabled bool, path string, level int, parentID *string, appID string) *Toggle {
	return &Toggle{
		ID:                generateULID(),
		Value:             value,
		Enabled:           enabled,
		Path:              path,
		Level:             level,
		ParentID:          parentID,
		AppID:             appID,
		HasActivationRule: false,
		ActivationRule:    nil,
	}
}

// SetActivationRule define uma regra de ativação para o toggle
func (t *Toggle) SetActivationRule(rule *ActivationRule) error {
	if rule != nil {
		if err := rule.ValidateRule(); err != nil {
			return err
		}
		t.ActivationRule = rule
		t.HasActivationRule = true
	} else {
		t.ActivationRule = nil
		t.HasActivationRule = false
	}
	return nil
}

// ClearActivationRule remove a regra de ativação do toggle
func (t *Toggle) ClearActivationRule() {
	t.ActivationRule = nil
	t.HasActivationRule = false
}

// IsEnabled verifica se o toggle está habilitado considerando a hierarquia
func (t *Toggle) IsEnabled() bool {
	if !t.Enabled {
		return false
	}

	// Se tem pai, verifica se o pai também está habilitado
	if t.Parent != nil {
		return t.Parent.IsEnabled()
	}

	return true
}

// GetFullPath retorna o caminho completo do toggle
func (t *Toggle) GetFullPath() string {
	if t.Parent != nil {
		return t.Parent.GetFullPath() + "." + t.Value
	}
	return t.Value
}

// ArchivedToggle é a raiz de uma exclusão arquivada (v2.6 §4.1) — um item por operação de
// exclusão, com o nome de quem apagou já resolvido (join com users), pra alimentar a modal
// "Archived" sem o frontend precisar de uma segunda chamada.
type ArchivedToggle struct {
	ID            string    `json:"id"`
	Path          string    `json:"path"`
	DeletedAt     time.Time `json:"deleted_at"`
	DeletedByName string    `json:"deleted_by_name"`
}

// ParseTogglePath converte uma string de caminho em partes
func ParseTogglePath(path string) []string {
	return strings.Split(path, ".")
}

// BuildTogglePath constrói o caminho a partir das partes
func BuildTogglePath(parts []string) string {
	return strings.Join(parts, ".")
}
