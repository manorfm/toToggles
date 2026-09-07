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

// auditRangeCutoff traduz o chip de intervalo do AuditToolbar (v2.6 §7 — "24h"/"7d"/"30d") num
// corte de created_at. "" ou qualquer valor não reconhecido (inclui o "all" do "All time") não
// filtra nada — mesmo comportamento de "sem filtro" que category="" já tinha.
func auditRangeCutoff(rangeParam string) *time.Time {
	var d time.Duration
	switch rangeParam {
	case "24h":
		d = 24 * time.Hour
	case "7d":
		d = 7 * 24 * time.Hour
	case "30d":
		d = 30 * 24 * time.Hour
	default:
		return nil
	}
	cutoff := time.Now().Add(-d)
	return &cutoff
}

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

// parseAuditPaging lê cursor/limit da query string — compartilhado por GetAuditLog e
// GetApplicationAudit, que paginam do mesmo jeito (cursor opaco em vez de número de página, um
// item a mais pedido pra descobrir se existe próxima página sem adivinhar pelo tamanho da
// página). Escreve a resposta de erro sozinho e devolve ok=false quando o cursor é inválido.
func parseAuditPaging(c *gin.Context) (cursor *repository.AuditLogCursor, limit int, ok bool) {
	if raw := c.Query("cursor"); raw != "" {
		decoded, err := decodeAuditCursor(raw)
		if err != nil {
			c.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "invalid cursor"))
			return nil, 0, false
		}
		cursor = decoded
	}

	limit, _ = strconv.Atoi(c.Query("limit"))
	switch {
	case limit <= 0:
		limit = usecase.DefaultAuditPageSize
	case limit > usecase.MaxAuditPageSize:
		limit = usecase.MaxAuditPageSize
	}
	return cursor, limit, true
}

// parseAuditCategory lê e valida o query param "category" — compartilhado por GetAuditLog e
// GetApplicationAudit, que agora oferecem os mesmos 4 chips de categoria (AuditChips, confirmado
// também na ActivityView real quando o design-graph passou a conseguir extrair esse componente;
// antes disso a Activity tab não tinha filtro de categoria nenhum). "" (chip "All") não filtra.
func parseAuditCategory(c *gin.Context) (category entity.AuditCategory, ok bool) {
	category = entity.AuditCategory(c.Query("category"))
	switch category {
	case "", entity.AuditCategoryToggles, entity.AuditCategoryKeys, entity.AuditCategoryAccess, entity.AuditCategoryApprovals:
		return category, true
	default:
		c.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "invalid category"))
		return "", false
	}
}

// paginateAuditLogs corta a linha extra pedida por parseAuditPaging+limit e monta o cursor da
// próxima página quando ela existir.
func paginateAuditLogs(logs []*entity.AuditLog, limit int) (page []*entity.AuditLog, nextCursor string) {
	if len(logs) > limit {
		logs = logs[:limit]
		nextCursor = encodeAuditCursor(&repository.AuditLogCursor{CreatedAt: logs[len(logs)-1].CreatedAt, ID: logs[len(logs)-1].ID})
	}
	return logs, nextCursor
}

// GetAuditLog lista o audit trail (History) — paginação infinita por cursor e filtros
// confirmados no AuditToolbar real (v2.6 §7): categoria (chips All/Toggles/Keys/Access/
// Approvals), ator exato e intervalo de tempo (24h/7d/30d). Root-only (RequireRoot() no grupo de
// rota, ver routes.go) — o texto confirmado da tela é "Root only... changes to toggles live in
// each application's Activity tab"; admin/user veem o audit trail de uma aplicação só pela
// Activity tab (GetApplicationAudit, abaixo), nunca este endpoint.
// GET /api/audit?category=toggles&actor_id=<id>&range=7d&cursor=<opaco>&limit=30
func (h *AuditHandler) GetAuditLog(c *gin.Context) {
	if auditActor(c) == nil {
		c.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	category, ok := parseAuditCategory(c)
	if !ok {
		return
	}

	cursor, limit, ok := parseAuditPaging(c)
	if !ok {
		return
	}

	opts := usecase.AuditListOptions{
		Category:     category,
		ActorID:      c.Query("actor_id"),
		CreatedAfter: auditRangeCutoff(c.Query("range")),
	}
	logs, err := h.auditUseCase.List(c.Request.Context(), opts, cursor, limit+1)
	if err != nil {
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "error fetching audit log"))
		return
	}

	page, nextCursor := paginateAuditLogs(logs, limit)
	c.JSON(http.StatusOK, gin.H{
		"data":        page,
		"next_cursor": nextCursor,
	})
}

// GetAuditActors lista TODOS os autores distintos — alimenta o `<select>` de filtro por ator do
// AuditToolbar. Root-only, mesmo motivo de GetAuditLog.
// GET /api/audit/actors
func (h *AuditHandler) GetAuditActors(c *gin.Context) {
	if auditActor(c) == nil {
		c.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	actors, err := h.auditUseCase.ListActors(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "error fetching audit actors"))
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": actors})
}

// GetApplicationAudit lista o audit trail de UMA aplicação (Activity tab, v2.6 §7) — qualquer
// usuário autenticado pode ver, mesma postura de acesso de GET /applications/:id (sem checagem
// de time por trás dela hoje); AuditUseCase.ListForApplication não recebe `caller` nenhum de
// propósito, ver o comentário lá. Categoria + intervalo (sem ator: a Activity real nunca teve um
// filtro de ator) — mesmos parâmetros de GetAuditLog, confirmados na ActivityView real.
// GET /api/applications/:id/audit?category=toggles&range=7d&cursor=<opaco>&limit=30
func (h *AuditHandler) GetApplicationAudit(c *gin.Context) {
	if auditActor(c) == nil {
		c.JSON(http.StatusUnauthorized, entity.NewAppError(entity.ErrCodeValidation, "user not authenticated"))
		return
	}

	applicationID := c.Param("id")
	if applicationID == "" {
		c.JSON(http.StatusBadRequest, entity.NewAppError(entity.ErrCodeValidation, "application ID is required"))
		return
	}

	category, ok := parseAuditCategory(c)
	if !ok {
		return
	}

	cursor, limit, ok := parseAuditPaging(c)
	if !ok {
		return
	}

	opts := usecase.AuditListOptions{
		Category:     category,
		CreatedAfter: auditRangeCutoff(c.Query("range")),
	}
	logs, err := h.auditUseCase.ListForApplication(c.Request.Context(), applicationID, opts, cursor, limit+1)
	if err != nil {
		c.JSON(http.StatusInternalServerError, entity.NewAppError(entity.ErrCodeInternal, "error fetching application audit log"))
		return
	}

	page, nextCursor := paginateAuditLogs(logs, limit)
	c.JSON(http.StatusOK, gin.H{
		"data":        page,
		"next_cursor": nextCursor,
	})
}
