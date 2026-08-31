package handler

import (
	"encoding/base64"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/manorfm/totoogle/internal/app/domain/entity"
	"github.com/manorfm/totoogle/internal/app/domain/repository"
	"github.com/manorfm/totoogle/internal/app/usecase"
)

type AuditHandler struct {
	auditUseCase *usecase.AuditUseCase
}

func NewAuditHandler(auditUseCase *usecase.AuditUseCase) *AuditHandler {
	return &AuditHandler{auditUseCase: auditUseCase}
}

// encodeAuditCursor/decodeAuditCursor: o cursor é opaco pro cliente de propósito (paginação
// infinita, sem número de página — ver docs/rest-flow.md) — só precisa devolver exatamente o
// que recebeu na próxima chamada, nunca construir um na mão.
func encodeAuditCursor(c *repository.AuditLogCursor) string {
	raw := c.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + c.ID
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeAuditCursor(encoded string) (*repository.AuditLogCursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	parts := strings.SplitN(string(raw), "|", 2)
	if len(parts) != 2 {
		return nil, entity.NewAppError(entity.ErrCodeValidation, "invalid cursor")
	}
	createdAt, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return nil, err
	}
	return &repository.AuditLogCursor{CreatedAt: createdAt, ID: parts[1]}, nil
}

// GetAuditLog lista o audit trail — paginação infinita por cursor (não por número de página) e
// filtro por categoria, os dois mecanismos confirmados no protótipo real (chips
// All/Toggles/Keys/Access/Approvals). Visibilidade escopada por time via
// domain/policy.AuditAccess, dentro de AuditUseCase.List.
// GET /api/audit?category=toggles&cursor=<opaco>&limit=30
func (h *AuditHandler) GetAuditLog(c *gin.Context) {
	user := auditActor(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	category := entity.AuditCategory(c.Query("category"))
	switch category {
	case "", entity.AuditCategoryToggles, entity.AuditCategoryKeys, entity.AuditCategoryAccess, entity.AuditCategoryApprovals:
		// válida
	default:
		c.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "invalid category"))
		return
	}

	var cursor *repository.AuditLogCursor
	if raw := c.Query("cursor"); raw != "" {
		decoded, err := decodeAuditCursor(raw)
		if err != nil {
			c.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "invalid cursor"))
			return
		}
		cursor = decoded
	}

	// Resolve o limit efetivo aqui (mesmo clamp que AuditUseCase.List faria sozinho) porque
	// precisamos saber esse número ANTES de chamar List, pra pedir uma linha a mais e descobrir
	// se existe próxima página sem adivinhar pelo tamanho da página devolvida (que empataria
	// exatamente no fim real dos dados também).
	limit, _ := strconv.Atoi(c.Query("limit"))
	switch {
	case limit <= 0:
		limit = usecase.DefaultAuditPageSize
	case limit > usecase.MaxAuditPageSize:
		limit = usecase.MaxAuditPageSize
	}

	logs, err := h.auditUseCase.List(c.Request.Context(), user, category, cursor, limit+1)
	if err != nil {
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "error fetching audit log"))
		return
	}

	var nextCursor string
	if len(logs) > limit {
		logs = logs[:limit]
		nextCursor = encodeAuditCursor(&repository.AuditLogCursor{CreatedAt: logs[len(logs)-1].CreatedAt, ID: logs[len(logs)-1].ID})
	}

	c.JSON(http.StatusOK, gin.H{
		"data":        logs,
		"next_cursor": nextCursor,
	})
}
