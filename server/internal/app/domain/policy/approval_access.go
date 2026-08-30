// Package policy holds authorization decisions (who may act on what) — the counterpart to
// domain/auth, which owns authentication (who the caller is). Keeping the two separate means
// every approval endpoint asks the same question the same way instead of re-deriving its own
// root/approver/membership check.
package policy

import (
	"context"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

// teamMembershipReader and teamApproverReader are the only two repository capabilities
// ApprovalAccess needs — kept narrow (ISP) so unit tests can fake them with one method each,
// instead of implementing the full repository.TeamRepository/TeamApproverRepository interfaces.
type teamMembershipReader interface {
	GetTeamsByUserID(userID string) ([]*entity.Team, error)
}

type teamApproverReader interface {
	IsUserApprover(ctx context.Context, teamID, userID string) (bool, error)
}

// ApprovalAccess centralizes authorization for the approval workflow. Root bypasses every
// check; everyone else is scoped to their own team memberships/approver assignments.
type ApprovalAccess struct {
	teamRepo         teamMembershipReader
	teamApproverRepo teamApproverReader
}

// NewApprovalAccess wires the policy from the two repositories it needs. Callers pass the real
// repository.TeamRepository/repository.TeamApproverRepository implementations, which satisfy
// the narrower interfaces above structurally.
func NewApprovalAccess(teamRepo teamMembershipReader, teamApproverRepo teamApproverReader) *ApprovalAccess {
	return &ApprovalAccess{teamRepo: teamRepo, teamApproverRepo: teamApproverRepo}
}

// CanAct reports whether user may approve, reject, or execute a request belonging to teamID.
// Root always can; anyone else must be a designated approver (team_users.is_approver) of teamID.
func (p *ApprovalAccess) CanAct(ctx context.Context, user *entity.User, teamID string) (bool, error) {
	if user.IsRoot() {
		return true, nil
	}
	return p.teamApproverRepo.IsUserApprover(ctx, teamID, user.ID)
}

// CanRead reports whether user may read or create requests scoped to teamID. Root always can;
// anyone else must simply be a member of teamID — no is_approver requirement.
func (p *ApprovalAccess) CanRead(ctx context.Context, user *entity.User, teamID string) (bool, error) {
	if user.IsRoot() {
		return true, nil
	}
	teams, err := p.teamRepo.GetTeamsByUserID(user.ID)
	if err != nil {
		return false, err
	}
	for _, t := range teams {
		if t.ID == teamID {
			return true, nil
		}
	}
	return false, nil
}

// VisibleTeamIDs returns the team IDs whose requests user may see in an unscoped list read
// (history, global stats). unrestricted=true (root) means the caller must not filter at all.
func (p *ApprovalAccess) VisibleTeamIDs(ctx context.Context, user *entity.User) (teamIDs []string, unrestricted bool, err error) {
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
