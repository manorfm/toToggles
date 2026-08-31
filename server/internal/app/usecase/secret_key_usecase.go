package usecase

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"

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

// CreateSecretKey cria uma nova secret key, já ativa (pronta pra autenticar)
func (uc *SecretKeyUseCase) CreateSecretKey(name, applicationID, createdBy string) (*CreateSecretKeyResponse, error) {
	return uc.createSecretKey(name, applicationID, createdBy, true)
}

// CreatePendingSecretKey cria uma secret key inativa — usada pelo fluxo de aprovação
// (ApprovalUseCase.CreateApprovalRequest) pra gerar o par hash/texto-puro já na hora da
// solicitação, sem deixá-la autenticar nada até ser aprovada (ver ActivateAndRotateSecretKey).
func (uc *SecretKeyUseCase) CreatePendingSecretKey(name, applicationID, createdBy string) (*CreateSecretKeyResponse, error) {
	return uc.createSecretKey(name, applicationID, createdBy, false)
}

func (uc *SecretKeyUseCase) createSecretKey(name, applicationID, createdBy string, active bool) (*CreateSecretKeyResponse, error) {
	secretKey := &entity.SecretKey{
		Name:          name,
		ApplicationID: applicationID,
		CreatedBy:     createdBy,
		Active:        active,
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

// ActivateAndRotateSecretKey ativa a secret key pendente identificada por newKeyID e apaga
// fisicamente qualquer outra chave da mesma aplicação — chamado só depois que uma solicitação de
// secret_key_create é aprovada e executada (ApprovalUseCase.executeSecretKeyCreateAction). Uma
// aplicação tem no máximo uma secret key ativa por vez, mesma invariante do fluxo imediato
// (RegenerateSecretKey); a antiga continua funcionando normalmente até este momento.
func (uc *SecretKeyUseCase) ActivateAndRotateSecretKey(newKeyID, applicationID string) error {
	existingKeys, err := uc.secretKeyRepo.GetByApplicationID(applicationID)
	if err != nil {
		return err
	}

	for _, key := range existingKeys {
		if key.ID == newKeyID {
			continue
		}
		if err := uc.secretKeyRepo.Delete(key.ID); err != nil {
			return err
		}
	}

	newKey, err := uc.secretKeyRepo.GetByID(newKeyID)
	if err != nil {
		return err
	}
	newKey.Active = true
	return uc.secretKeyRepo.Update(newKey)
}

// GetSecretKeysByApplicationID retorna as secret keys ATIVAS de uma aplicação — uma chave criada
// por uma solicitação de aprovação ainda pendente não aparece aqui (não é "a chave da aplicação"
// até ser aprovada; ver ActivateAndRotateSecretKey). Quem a gerou já tem o valor em texto puro
// (devolvido na hora da solicitação), então não precisa dela aparecer nesta lista pra poder usá-la.
func (uc *SecretKeyUseCase) GetSecretKeysByApplicationID(applicationID string) ([]*entity.SecretKey, error) {
	keys, err := uc.secretKeyRepo.GetByApplicationID(applicationID)
	if err != nil {
		return nil, err
	}

	active := make([]*entity.SecretKey, 0, len(keys))
	for _, key := range keys {
		if key.Active {
			active = append(active, key)
		}
	}
	return active, nil
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

// ValidateSecretKey valida uma secret key fornecida. Uma chave pendente de aprovação
// (Active == false) tem hash válido no banco mas não autentica nada até ser aprovada — mesmo
// erro de "não encontrada" das duas situações, pra não vazar pra quem apresenta a chave se ela
// existe e só está pendente, ou se nunca existiu.
func (uc *SecretKeyUseCase) ValidateSecretKey(secretKey string) (*entity.SecretKey, error) {
	// Gerar hash da chave fornecida
	hash := sha256.Sum256([]byte(secretKey))
	keyHash := hex.EncodeToString(hash[:])

	// Buscar pela hash no banco
	key, err := uc.secretKeyRepo.GetByHash(keyHash)
	if err != nil {
		return nil, err
	}
	if !key.Active {
		return nil, errors.New("secret key not found")
	}
	return key, nil
}

// RegenerateSecretKey regenera uma secret key existente, invalidando a anterior
func (uc *SecretKeyUseCase) RegenerateSecretKey(applicationID, createdBy string) (*CreateSecretKeyResponse, error) {
	// Primeiro, delete todas as secret keys existentes da aplicação
	existingKeys, err := uc.secretKeyRepo.GetByApplicationID(applicationID)
	if err != nil {
		return nil, err
	}

	// Remove todas as chaves existentes
	for _, key := range existingKeys {
		err = uc.secretKeyRepo.Delete(key.ID)
		if err != nil {
			return nil, err
		}
	}

	// Cria uma nova secret key
	return uc.CreateSecretKey("API Access Key", applicationID, createdBy)
}
