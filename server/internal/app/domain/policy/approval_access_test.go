package policy

import (
	"context"
	"errors"
	"testing"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

type fakeTeamMembership struct {
	teams map[string][]string // userID -> teamIDs
	err   error
}

func (f *fakeTeamMembership) GetTeamsByUserID(userID string) ([]*entity.Team, error) {
	if f.err != nil {
		return nil, f.err
	}
	var teams []*entity.Team
	for _, id := range f.teams[userID] {
		teams = append(teams, &entity.Team{ID: id})
	}
	return teams, nil
}

type fakeTeamApprover struct {
	approverOf map[string]map[string]bool // teamID -> userID -> isApprover
	err        error
}

func (f *fakeTeamApprover) IsUserApprover(ctx context.Context, teamID, userID string) (bool, error) {
	if f.err != nil {
		return false, f.err
	}
	return f.approverOf[teamID][userID], nil
}

func rootUser() *entity.User            { return &entity.User{ID: "root-1", Role: entity.UserRoleRoot} }
func memberUser(id string) *entity.User { return &entity.User{ID: id, Role: entity.UserRoleAdmin} }

func TestApprovalAccess_CanAct(t *testing.T) {
	membership := &fakeTeamMembership{teams: map[string][]string{"approver-1": {"team-a"}, "member-1": {"team-a"}}}
	approver := &fakeTeamApprover{approverOf: map[string]map[string]bool{"team-a": {"approver-1": true}}}
	access := NewApprovalAccess(membership, approver)

	tests := []struct {
		name   string
		user   *entity.User
		teamID string
		want   bool
	}{
		{"root can act on any team", rootUser(), "team-a", true},
		{"root can act on a team it's not related to", rootUser(), "team-z", true},
		{"approver of the team can act", memberUser("approver-1"), "team-a", true},
		{"approver of a different team cannot act", memberUser("approver-1"), "team-b", false},
		{"plain member (not approver) cannot act", memberUser("member-1"), "team-a", false},
		{"non-member cannot act", memberUser("stranger"), "team-a", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := access.CanAct(context.Background(), tt.user, tt.teamID)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("CanAct() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestApprovalAccess_CanRead(t *testing.T) {
	membership := &fakeTeamMembership{teams: map[string][]string{"member-1": {"team-a"}}}
	access := NewApprovalAccess(membership, &fakeTeamApprover{})

	tests := []struct {
		name   string
		user   *entity.User
		teamID string
		want   bool
	}{
		{"root can read any team", rootUser(), "team-a", true},
		{"member can read own team", memberUser("member-1"), "team-a", true},
		{"member cannot read a different team", memberUser("member-1"), "team-b", false},
		{"non-member cannot read", memberUser("stranger"), "team-a", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := access.CanRead(context.Background(), tt.user, tt.teamID)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("CanRead() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestApprovalAccess_VisibleTeamIDs(t *testing.T) {
	membership := &fakeTeamMembership{teams: map[string][]string{"member-1": {"team-a", "team-b"}}}
	access := NewApprovalAccess(membership, &fakeTeamApprover{})

	t.Run("root sees everything, unrestricted", func(t *testing.T) {
		ids, unrestricted, err := access.VisibleTeamIDs(context.Background(), rootUser())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !unrestricted {
			t.Error("expected unrestricted=true for root")
		}
		if len(ids) != 0 {
			t.Errorf("expected no team filter for root, got %v", ids)
		}
	})

	t.Run("non-root sees only own teams", func(t *testing.T) {
		ids, unrestricted, err := access.VisibleTeamIDs(context.Background(), memberUser("member-1"))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if unrestricted {
			t.Error("expected unrestricted=false for non-root")
		}
		if len(ids) != 2 || ids[0] != "team-a" || ids[1] != "team-b" {
			t.Errorf("expected [team-a team-b], got %v", ids)
		}
	})
}

func TestApprovalAccess_PropagatesRepositoryErrors(t *testing.T) {
	boom := errors.New("boom")
	access := NewApprovalAccess(&fakeTeamMembership{err: boom}, &fakeTeamApprover{err: boom})

	if _, err := access.CanRead(context.Background(), memberUser("x"), "team-a"); !errors.Is(err, boom) {
		t.Errorf("CanRead: expected error to propagate, got %v", err)
	}
	if _, err := access.CanAct(context.Background(), memberUser("x"), "team-a"); !errors.Is(err, boom) {
		t.Errorf("CanAct: expected error to propagate, got %v", err)
	}
	if _, _, err := access.VisibleTeamIDs(context.Background(), memberUser("x")); !errors.Is(err, boom) {
		t.Errorf("VisibleTeamIDs: expected error to propagate, got %v", err)
	}
}
