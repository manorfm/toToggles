package usecase

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

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
	secretKey := entity.NewSecretKey(name, applicationID, createdBy, active)

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

// rotateExistingKeys prepara o "slot" de overlap antes de uma nova chave nascer como a nova
// atual (v2.6 §5.1) — chamado tanto pelo fluxo imediato (RegenerateSecretKey) quanto pela
// execução de um secret_key_create aprovado (ActivateAndRotateSecretKey), mesma lógica pros dois
// caminhos. Só há espaço pra 1 "previous" por vez (mesmo modelo do protótipo real: KEYS[appId] =
// {current, previous}, nunca uma pilha): a chave CURRENT existente vira PREVIOUS (continua
// autenticando durante a janela de overlap), e qualquer PREVIOUS que já existisse antes disso é
// revogada de vez — ela está prestes a ser empurrada pra fora da janela de overlap de qualquer
// forma. Chaves ainda pendentes de aprovação (Active=false) e chaves já revogadas nunca
// participam — não são "a chave ativa" de propósito nenhum aqui.
func (uc *SecretKeyUseCase) rotateExistingKeys(applicationID string) error {
	keys, err := uc.secretKeyRepo.GetByApplicationID(applicationID)
	if err != nil {
		return err
	}

	for _, key := range keys {
		if !key.Active || key.RevokedAt != nil {
			continue
		}
		if key.IsCurrent {
			key.IsCurrent = false
			if err := uc.secretKeyRepo.Update(key); err != nil {
				return err
			}
			continue
		}
		if err := uc.RevokeSecretKey(key.ID); err != nil {
			return err
		}
	}
	return nil
}

// RevokeSecretKey marca uma chave como revogada de vez (v2.6 §5.1) — ela para de autenticar
// (ValidateSecretKey) e some da listagem (GetSecretKeysByApplicationID), mas a linha continua no
// banco (histórico), diferente de DeleteSecretKey (remoção física, usada só pra limpar uma chave
// PENDENTE que nunca chegou a ser aprovada — nesse caso ela nunca foi real, não há histórico a
// preservar).
func (uc *SecretKeyUseCase) RevokeSecretKey(id string) error {
	key, err := uc.secretKeyRepo.GetByID(id)
	if err != nil {
		return err
	}
	now := time.Now()
	key.RevokedAt = &now
	return uc.secretKeyRepo.Update(key)
}

// ActivateAndRotateSecretKey ativa a secret key pendente identificada por newKeyID e coloca a
// chave atual (se houver) na janela de overlap como "previous" — chamado só depois que uma
// solicitação de secret_key_create é aprovada e executada
// (ApprovalUseCase.executeSecretKeyCreateAction). A antiga continua autenticando normalmente
// durante a janela de overlap (ver rotateExistingKeys).
func (uc *SecretKeyUseCase) ActivateAndRotateSecretKey(newKeyID, applicationID string) error {
	if err := uc.rotateExistingKeys(applicationID); err != nil {
		return err
	}

	newKey, err := uc.secretKeyRepo.GetByID(newKeyID)
	if err != nil {
		return err
	}
	newKey.Active = true
	newKey.IsCurrent = true
	return uc.secretKeyRepo.Update(newKey)
}

// GetSecretKeysByApplicationID retorna as secret keys ATIVAS e NÃO-REVOGADAS de uma aplicação —
// até 2 (current + previous) durante uma janela de overlap (v2.6 §5.1). Uma chave criada por uma
// solicitação de aprovação ainda pendente não aparece aqui (não é "a chave da aplicação" até ser
// aprovada; ver ActivateAndRotateSecretKey). Quem a gerou já tem o valor em texto puro (devolvido
// na hora da solicitação), então não precisa dela aparecer nesta lista pra poder usá-la.
func (uc *SecretKeyUseCase) GetSecretKeysByApplicationID(applicationID string) ([]*entity.SecretKey, error) {
	keys, err := uc.secretKeyRepo.GetByApplicationID(applicationID)
	if err != nil {
		return nil, err
	}

	active := make([]*entity.SecretKey, 0, len(keys))
	for _, key := range keys {
		if key.Active && key.RevokedAt == nil {
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
// (Active == false) ou revogada (RevokedAt != nil) tem hash válido no banco mas não autentica
// nada — mesmo erro de "não encontrada" nos três casos (pendente/revogada/inexistente), pra não
// vazar pra quem apresenta a chave qual dessas situações é a real. Tanto a chave CURRENT quanto a
// PREVIOUS (durante a janela de overlap, v2.6 §5.1) autenticam aqui — a distinção current/previous
// só importa pra UI, nunca pra este endpoint.
func (uc *SecretKeyUseCase) ValidateSecretKey(secretKey string) (*entity.SecretKey, error) {
	// Gerar hash da chave fornecida
	hash := sha256.Sum256([]byte(secretKey))
	keyHash := hex.EncodeToString(hash[:])

	// Buscar pela hash no banco
	key, err := uc.secretKeyRepo.GetByHash(keyHash)
	if err != nil {
		return nil, err
	}
	if !key.Active || key.RevokedAt != nil {
		return nil, errors.New("secret key not found")
	}

	// v2.6 §5.6: tracking real de último uso — best-effort de propósito (nunca falha a
	// autenticação por causa disso). Esta é a rota pública mais quente do sistema (toda leitura
	// de toggles passa por aqui); um erro ao gravar o timestamp não deveria derrubar a resposta
	// real que o chamador está esperando.
	now := time.Now()
	key.LastUsedAt = &now
	_ = uc.secretKeyRepo.Update(key)

	return key, nil
}

// RegenerateSecretKey regenera uma secret key existente — a atual vira "previous" e continua
// autenticando durante a janela de overlap (v2.6 §5.1), em vez de ser apagada na hora (ver
// rotateExistingKeys).
func (uc *SecretKeyUseCase) RegenerateSecretKey(applicationID, createdBy string) (*CreateSecretKeyResponse, error) {
	if err := uc.rotateExistingKeys(applicationID); err != nil {
		return nil, err
	}

	return uc.CreateSecretKey("API Access Key", applicationID, createdBy)
}
