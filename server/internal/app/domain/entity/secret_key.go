package entity

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
)

type SecretKey struct {
	ID            string `json:"id" gorm:"primaryKey;type:varchar(26)"`
	Name          string `json:"name" gorm:"not null;type:varchar(100)"`         // Nome descritivo da chave
	KeyHash       string `json:"-" gorm:"not null;type:varchar(64);uniqueIndex"` // SHA256 hash da chave
	ApplicationID string `json:"application_id" gorm:"not null;type:varchar(26)"`
	CreatedBy     string `json:"created_by" gorm:"not null;type:varchar(26)"` // ID do usuário que criou
	// Active é false enquanto a chave foi criada por um secret_key_create que ainda está pendente
	// de aprovação — o registro (hash incluso) já existe pra que a chave em texto puro possa ser
	// entregue a quem pediu na hora (ver ApprovalUseCase.CreateApprovalRequest), mas
	// ValidateSecretKey recusa chaves inativas, então ela não autentica nada até ser aprovada.
	// Sempre true fora do fluxo de aprovação (ver SecretKeyUseCase.CreateSecretKey). SEM a tag
	// `default:` de propósito: GORM omite do INSERT qualquer campo com tag `default` cujo valor Go
	// seja o zero-value do tipo — `false` é o zero-value de bool, então marcar a coluna com
	// `default:true` faria toda tentativa de criar já como Active:false (o caso justamente mais
	// importante aqui) ser silenciosamente sobrescrita pelo default da coluna. O código sempre
	// define Active explicitamente (createSecretKey), então não depende do default da coluna; ele
	// só existe na migration como salvaguarda pras linhas legadas de antes desta coluna existir.
	Active bool `json:"active" gorm:"not null"`
	// IsCurrent distingue, entre as chaves não-revogadas de uma aplicação, qual é a "atual"
	// (mostrada como a chave de verdade na UI) da "anterior" (v2.6 §5.1 — sobrevive por uma
	// janela de overlap depois de uma rotação, pra não quebrar consumidores que ainda não
	// atualizaram). Mesma cautela do campo Active acima: SEM a tag `default:` de propósito —
	// GORM pula do INSERT todo campo com tag `default` cujo valor Go seja o zero-value do tipo
	// (`false` pra bool), então um `default:true` aqui faria qualquer tentativa futura de criar
	// já como IsCurrent:false (hipotético, não usado hoje, mas não vale o risco) ser
	// silenciosamente sobrescrita. O código sempre define IsCurrent explicitamente (createSecretKey
	// sempre cria como true — é a nova chave "atual" por definição).
	IsCurrent bool `json:"is_current" gorm:"not null"`
	// RevokedAt marca revogação DEFINITIVA (v2.6 §5.1) — diferente de Active=false, que significa
	// "ainda pendente de aprovação" (um estado transitório, nunca definitivo). Uma chave revogada
	// nunca mais autentica (ValidateSecretKey) nem aparece em GetSecretKeysByApplicationID.
	RevokedAt *time.Time `json:"-"`
	// LastUsedAt (v2.6 §5.6) — atualizado a cada ValidateSecretKey bem sucedido; nil quando a
	// chave nunca foi usada. Rastreamento real, não um mock — upgrade deliberado além do
	// protótipo (que só mostra "(demo — not tracked)").
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`

	// Relacionamentos
	Application Application `json:"application,omitempty" gorm:"foreignKey:ApplicationID"`
	Creator     User        `json:"creator,omitempty" gorm:"foreignKey:CreatedBy"`
}

// BeforeCreate hook para gerar ID único
func (sk *SecretKey) BeforeCreate(tx *gorm.DB) error {
	if sk.ID == "" {
		sk.ID = generateULID()
	}
	return nil
}

// NewSecretKey cria uma nova instância de SecretKey com ID já gerado — mesmo padrão de
// NewApplication/NewToggle/NewAuditLog: gerar o ID aqui (não só via BeforeCreate) permite que um
// repositório que não passa pelos hooks do GORM (o mock usado nos testes de SecretKeyUseCase, por
// exemplo) continue funcionando sem duplicar a lógica de geração de ID. Toda chave nova nasce
// IsCurrent — é a nova chave "atual" por definição no momento em que é criada (ver
// SecretKeyUseCase.rotateExistingKeys pra quando ela deixa de ser).
func NewSecretKey(name, applicationID, createdBy string, active bool) *SecretKey {
	return &SecretKey{
		ID:            generateULID(),
		Name:          name,
		ApplicationID: applicationID,
		CreatedBy:     createdBy,
		Active:        active,
		IsCurrent:     true,
	}
}

// GenerateSecretKey gera uma nova chave secreta segura
func GenerateSecretKey() (string, error) {
	// Gera 32 bytes aleatórios (256 bits)
	bytes := make([]byte, 32)
	_, err := rand.Read(bytes)
	if err != nil {
		return "", err
	}

	// Converte para hex e adiciona prefixo
	secretKey := fmt.Sprintf("sk_%s", hex.EncodeToString(bytes))
	return secretKey, nil
}

// SetSecretKey gera uma nova chave e armazena seu hash
func (sk *SecretKey) SetSecretKey() (string, error) {
	secretKey, err := GenerateSecretKey()
	if err != nil {
		return "", err
	}

	// Gera hash SHA256 da chave
	hash := sha256.Sum256([]byte(secretKey))
	sk.KeyHash = hex.EncodeToString(hash[:])

	return secretKey, nil
}

// Validate valida os dados da secret key
func (sk *SecretKey) Validate() error {
	if sk.Name == "" {
		return errors.New("secret key name is required")
	}

	if len(sk.Name) < 3 {
		return errors.New("secret key name must be at least 3 characters long")
	}

	if sk.ApplicationID == "" {
		return errors.New("application ID is required")
	}

	if sk.CreatedBy == "" {
		return errors.New("created by user ID is required")
	}

	return nil
}
