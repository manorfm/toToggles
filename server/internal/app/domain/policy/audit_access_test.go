package policy

import (
	"context"
	"errors"
	"testing"
)

func TestAuditAccess_VisibleTeamIDs(t *testing.T) {
	membership := &fakeTeamMembership{teams: map[string][]string{"member-1": {"team-a", "team-b"}}}
	access := NewAuditAccess(membership)

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

	t.Run("non-member sees no teams", func(t *testing.T) {
		ids, unrestricted, err := access.VisibleTeamIDs(context.Background(), memberUser("stranger"))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if unrestricted {
			t.Error("expected unrestricted=false for a non-member")
		}
		if len(ids) != 0 {
			t.Errorf("expected no visible teams, got %v", ids)
		}
	})
}

func TestAuditAccess_PropagatesRepositoryErrors(t *testing.T) {
	boom := errors.New("boom")
	access := NewAuditAccess(&fakeTeamMembership{err: boom})

	if _, _, err := access.VisibleTeamIDs(context.Background(), memberUser("x")); !errors.Is(err, boom) {
		t.Errorf("VisibleTeamIDs: expected error to propagate, got %v", err)
	}
}
