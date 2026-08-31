package entity

import (
	"time"

	"gorm.io/gorm"
)

// AuditCategory agrupa AuditEventType nos 4 filtros confirmados no protótipo real (AUDIT_CAT
// em data.js, decodificado do bundle comprimido embutido em docs/toToggle.html — ver
// server/CLAUDE.md) — Toggles/Keys/Access/Approvals.
type AuditCategory string

const (
	AuditCategoryToggles   AuditCategory = "toggles"
	AuditCategoryKeys      AuditCategory = "keys"
	AuditCategoryAccess    AuditCategory = "access"
	AuditCategoryApprovals AuditCategory = "approvals"
)

// AuditEventType é o tipo semântico do evento — o que aconteceu de fato, não qual rota HTTP foi
// chamada (isso já existe, separadamente, como ApprovalActionType — usado só pelo gate de
// aprovação). Diferente do protótipo real, onde um único type genérico ("create"/"delete") é
// reusado entre domínios diferentes (toggle E aplicação E usuário) — o que faz um evento de
// "apagar usuário" cair na categoria "toggles" lá (AUDIT_CAT["delete"] === "toggles"), um bug
// de categorização real, não replicado aqui: cada tipo abaixo mapeia pra exatamente uma
// categoria, sem ambiguidade (ver EventCategory).
type AuditEventType string

const (
	AuditEventToggleCreated  AuditEventType = "toggle_created"
	AuditEventToggleDeleted  AuditEventType = "toggle_deleted"
	AuditEventToggleEnabled  AuditEventType = "toggle_enabled"
	AuditEventToggleDisabled AuditEventType = "toggle_disabled"
	AuditEventToggleRuleSet  AuditEventType = "toggle_rule_set"

	// Applications ficam na categoria "toggles" — mesma escolha do protótipo real (não têm
	// categoria própria lá; uma aplicação é, na prática, a raiz de uma árvore de toggles).
	AuditEventApplicationCreated AuditEventType = "application_created"
	AuditEventApplicationDeleted AuditEventType = "application_deleted"
	// Sem equivalente real no protótipo (editar uma app lá só dá toast, nunca logAudit) —
	// necessário aqui porque PUT /applications/:id é uma ação de verdade que pode passar pelo
	// workflow de aprovação (docs/rest-flow.md §9.1: reusa o action_type application_create,
	// mas o EVENTO de auditoria da execução precisa distinguir "criei" de "editei").
	AuditEventApplicationUpdated AuditEventType = "application_updated"

	AuditEventKeyGenerated AuditEventType = "key_generated"
	AuditEventKeyRevoked   AuditEventType = "key_revoked"

	AuditEventTeamCreated       AuditEventType = "team_created"
	AuditEventMemberAdded       AuditEventType = "member_added"
	AuditEventMemberRemoved     AuditEventType = "member_removed"
	AuditEventUserCreated       AuditEventType = "user_created"
	AuditEventUserDeleted       AuditEventType = "user_deleted"
	AuditEventUserStatusChanged AuditEventType = "user_status_changed"
	AuditEventUserPasswordReset AuditEventType = "user_password_reset"

	AuditEventApprovalApproved      AuditEventType = "approval_approved"
	AuditEventApprovalRejected      AuditEventType = "approval_rejected"
	AuditEventApprovalSystemToggled AuditEventType = "approval_system_toggled"
	// Confirmado no protótipo real como o type "approval-request" (requestApproval): o
	// MOMENTO em que alguém pede aprovação, gravado com o SOLICITANTE como actor — sem isso, o
	// audit trail de qualquer ação que passe pelo workflow nunca mostra quem pediu, só quem
	// aprovou (gap real encontrado numa auditoria pedida pelo usuário, comparando o History ao
	// vivo: tudo aparecia como "root", o aprovador, porque só ApproveRequest gravava algo).
	AuditEventApprovalRequested AuditEventType = "approval_requested"
)

// EventCategory devolve a categoria fixa de cada tipo — usada tanto pra gravar quanto pra
// validar o filtro `category` recebido em GetAuditLog.
func (t AuditEventType) EventCategory() AuditCategory {
	switch t {
	case AuditEventToggleCreated, AuditEventToggleDeleted, AuditEventToggleEnabled, AuditEventToggleDisabled,
		AuditEventToggleRuleSet, AuditEventApplicationCreated, AuditEventApplicationUpdated, AuditEventApplicationDeleted:
		return AuditCategoryToggles
	case AuditEventKeyGenerated, AuditEventKeyRevoked:
		return AuditCategoryKeys
	case AuditEventTeamCreated, AuditEventMemberAdded, AuditEventMemberRemoved,
		AuditEventUserCreated, AuditEventUserDeleted, AuditEventUserStatusChanged, AuditEventUserPasswordReset:
		return AuditCategoryAccess
	case AuditEventApprovalApproved, AuditEventApprovalRejected, AuditEventApprovalSystemToggled, AuditEventApprovalRequested:
		return AuditCategoryApprovals
	default:
		return ""
	}
}

// AuditLog é uma entrada do audit trail — texto estruturado (não HTML), diferente do protótipo
// real (HistoryView#audit-text usa dangerouslySetInnerHTML sobre um `text` com `<b>` embutido).
// Um `target` (nome de toggle/aplicação/time/usuário) que vier de input do usuário nunca deveria
// ir pro DOM sem escape — gravar HTML cru no banco só empurra esse risco de XSS armazenado pra
// mais tarde; aqui `Text` é sempre texto puro e `Target`, quando presente, é um campo separado,
// o frontend decide como destacar cada um sem interpretar marcação.
type AuditLog struct {
	ID        string         `json:"id" gorm:"primaryKey;type:varchar(26)"`
	EventType AuditEventType `json:"event_type" gorm:"not null;type:varchar(40);index"`
	Category  AuditCategory  `json:"category" gorm:"not null;type:varchar(20);index"`
	Text      string         `json:"text" gorm:"not null;type:varchar(255)"`
	Target    string         `json:"target" gorm:"type:varchar(255)"`
	// TeamID escopa a visibilidade (domain/policy.AuditAccess) — null só pra eventos globais
	// (hoje, só approval_system_toggled), que são sempre root-only independente disso.
	TeamID    *string   `json:"team_id" gorm:"type:varchar(26);index"`
	ActorID   string    `json:"actor_id" gorm:"not null;type:varchar(26)"`
	ActorName string    `json:"actor_name" gorm:"not null;type:varchar(100)"`
	CreatedAt time.Time `json:"created_at" gorm:"index"`
}

// BeforeCreate gera um ID único, mesmo padrão das demais entidades.
func (a *AuditLog) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = generateULID()
	}
	return nil
}

// NewAuditLog cria uma entrada nova a partir do tipo do evento (que já sabe sua categoria) —
// não há como criar uma AuditLog com categoria inconsistente com o tipo.
func NewAuditLog(eventType AuditEventType, text, target string, teamID *string, actorID, actorName string) *AuditLog {
	return &AuditLog{
		EventType: eventType,
		Category:  eventType.EventCategory(),
		Text:      text,
		Target:    target,
		TeamID:    teamID,
		ActorID:   actorID,
		ActorName: actorName,
	}
}
