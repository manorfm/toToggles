package usecase

import (
	"crypto/sha256"
	"encoding/hex"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
)

type SecretKeyUseCase struct {
	secretKeyRepo repository.SecretKeyRepository
}

func NewSecretKeyUseCase(secretKeyRepo repository.SecretKeyRepository) *SecretKeyUseCase {
	return &SecretKeyUseCase{
		secretKeyRepo: secretKeyRepo,
	}
}

// CreateSecretKeyResponse representa a resposta da criação de uma secret key
type CreateSecretKeyResponse struct {
	SecretKey    *entity.SecretKey `json:"secret_key"`
	PlainTextKey string            `json:"plain_text_key"` // Só retornado na criação
}

// CreateSecretKey cria uma nova secret key
func (uc *SecretKeyUseCase) CreateSecretKey(name, applicationID, createdBy string) (*CreateSecretKeyResponse, error) {
	secretKey := &entity.SecretKey{
		Name:          name,
		ApplicationID: applicationID,
		CreatedBy:     createdBy,
	}

	err := secretKey.Validate()
	if err != nil {
		return nil, err
	}

	// Gerar a chave secreta
	plainTextKey, err := secretKey.SetSecretKey()
	if err != nil {
		return nil, err
	}

	err = uc.secretKeyRepo.Create(secretKey)
	if err != nil {
		return nil, err
	}

	return &CreateSecretKeyResponse{
		SecretKey:    secretKey,
		PlainTextKey: plainTextKey,
	}, nil
}

// GetSecretKeysByApplicationID retorna todas as secret keys de uma aplicação
func (uc *SecretKeyUseCase) GetSecretKeysByApplicationID(applicationID string) ([]*entity.SecretKey, error) {
	return uc.secretKeyRepo.GetByApplicationID(applicationID)
}

// GetAllSecretKeys retorna todas as secret keys
func (uc *SecretKeyUseCase) GetAllSecretKeys() ([]*entity.SecretKey, error) {
	return uc.secretKeyRepo.GetAll()
}

// GetSecretKeyByID retorna uma secret key pelo ID
func (uc *SecretKeyUseCase) GetSecretKeyByID(id string) (*entity.SecretKey, error) {
	return uc.secretKeyRepo.GetByID(id)
}

// DeleteSecretKey remove uma secret key
func (uc *SecretKeyUseCase) DeleteSecretKey(id string) error {
	return uc.secretKeyRepo.Delete(id)
}

// ValidateSecretKey valida uma secret key fornecida
func (uc *SecretKeyUseCase) ValidateSecretKey(secretKey string) (*entity.SecretKey, error) {
	// Gerar hash da chave fornecida
	hash := sha256.Sum256([]byte(secretKey))
	keyHash := hex.EncodeToString(hash[:])

	// Buscar pela hash no banco
	return uc.secretKeyRepo.GetByHash(keyHash)
}