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
	Active    bool      `json:"active" gorm:"not null"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

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
