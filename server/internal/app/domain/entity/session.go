package entity

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"time"

	"gorm.io/gorm"
)

// SessionPurpose distingue uma sessão de autenticação normal de um token de uso único pra
// troca de senha obrigatória no primeiro acesso — os dois compartilham a mesma tabela/mecanismo
// de token opaco, só divergem em TTL e em serem ou não de uso único.
type SessionPurpose string

const (
	SessionPurposeAuth           SessionPurpose = "auth"
	SessionPurposePasswordChange SessionPurpose = "password_change"
)

// Session é um token de sessão opaco server-side — o mesmo padrão já usado por SecretKey
// (crypto/rand + hash SHA-256 armazenado, nunca o valor bruto) aplicado a sessões de usuário.
// Substitui um esquema anterior onde o "token" era só "token_"+userID (sem assinatura nem
// verificação nenhuma) — qualquer um que soubesse o ID de um usuário conseguia se autenticar
// como ele.
type Session struct {
	ID        string         `json:"id" gorm:"primaryKey;type:varchar(26)"`
	TokenHash string         `json:"-" gorm:"not null;type:varchar(64);uniqueIndex"`
	UserID    string         `json:"user_id" gorm:"not null;type:varchar(26);index"`
	Purpose   SessionPurpose `json:"purpose" gorm:"not null;type:varchar(20)"`
	ExpiresAt time.Time      `json:"expires_at" gorm:"not null;index"`
	CreatedAt time.Time      `json:"created_at"`
}

// BeforeCreate gera um ID único, mesmo padrão de SecretKey/demais entidades.
func (s *Session) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = generateULID()
	}
	return nil
}

// NewSession cria uma nova sessão com um token bruto aleatório (nunca persistido — só o hash
// vai pro banco) e devolve esse token bruto pra ser entregue ao cliente (cookie), exatamente
// como entity.GenerateSecretKey/SetSecretKey fazem pra secret keys.
func NewSession(userID string, purpose SessionPurpose, ttl time.Duration) (*Session, string, error) {
	raw, err := generateSessionToken()
	if err != nil {
		return nil, "", err
	}

	session := &Session{
		TokenHash: HashSessionToken(raw),
		UserID:    userID,
		Purpose:   purpose,
		ExpiresAt: time.Now().Add(ttl),
	}
	return session, raw, nil
}

// IsExpired reporta se a sessão já passou do prazo de validade.
func (s *Session) IsExpired() bool {
	return time.Now().After(s.ExpiresAt)
}

// generateSessionToken gera 32 bytes aleatórios (256 bits) via crypto/rand, hex-encoded —
// mesma forma de entity.GenerateSecretKey.
func generateSessionToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// HashSessionToken calcula o hash SHA-256 (hex) de um token bruto — é isso, nunca o token em
// si, que fica armazenado no banco e usado pra lookup.
func HashSessionToken(raw string) string {
	hash := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(hash[:])
}
