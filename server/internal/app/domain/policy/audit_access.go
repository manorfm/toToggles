package policy

import (
	"context"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

// AuditAccess centraliza a visibilidade do audit trail. Root bypassa (vê tudo, sem filtro);
// qualquer outro usuário só vê eventos escopados a um time do qual é membro — a mesma regra
// já validada em ApprovalAccess.VisibleTeamIDs, mas com nome/dono próprios: audit e approval
// são domínios diferentes, mesmo reaproveitando a mesma pergunta ("quais times este usuário
// enxerga?").
//
// Essa única regra (team_id IN times do usuário) cobre as 4 categorias sem lógica por
// categoria: eventos de time/acesso (incluindo gestão de usuário — aproximação deliberada da
// regra canManageUser, que é "compartilha QUALQUER time com o alvo": aqui o evento carrega o
// team_id relevante da ação, não uma lista de todos os times do usuário afetado) usam o mesmo
// team_id de toggles/keys/approvals; eventos globais (hoje só o on/off do sistema de aprovação)
// gravam team_id nil, e como `NULL IN (...)` nunca é verdadeiro em SQL, um não-root nunca vê
// esse tipo de linha — root-only "de graça", sem checagem especial.
type AuditAccess struct {
	teamRepo teamMembershipReader
}

func NewAuditAccess(teamRepo teamMembershipReader) *AuditAccess {
	return &AuditAccess{teamRepo: teamRepo}
}

// VisibleTeamIDs devolve os times que user pode ver no audit trail. unrestricted=true (root)
// significa "não filtrar por time nenhum" — teamIDs vem vazio nesse caso.
func (p *AuditAccess) VisibleTeamIDs(ctx context.Context, user *entity.User) (teamIDs []string, unrestricted bool, err error) {
	if user.IsRoot() {
		return nil, true, nil
	}
	teams, err := p.teamRepo.GetTeamsByUserID(user.ID)
	if err != nil {
		return nil, false, err
	}
	ids := make([]string, 0, len(teams))
	for _, t := range teams {
		ids = append(ids, t.ID)
	}
	return ids, false, nil
}
