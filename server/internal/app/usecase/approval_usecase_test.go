package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/manorfm/totoogle/internal/app/domain/entity"
)

// newApprovalUseCaseForAccessTests wires an ApprovalUseCase the same way NewApprovalUseCase does
// (real policy.ApprovalAccess over the mock team repos) so these tests exercise the actual
// authorization wiring, not a stand-in.
func newApprovalUseCaseForAccessTests() (*ApprovalUseCase, *MockApprovalRequestRepository, *MockTeamRepository, *MockTeamApproverRepository, *MockUserRepository) {
	requestRepo := NewMockApprovalRequestRepository()
	teamRepo := NewMockTeamRepository()
	teamApproverRepo := NewMockTeamApproverRepository()
	userRepo := NewMockUserRepository()
	settingsRepo := NewMockApprovalSettingsRepository()

	uc := NewApprovalUseCase(
		requestRepo,
		settingsRepo,
		teamApproverRepo,
		userRepo,
		teamRepo,
		nil, nil, nil, nil, nil, nil, nil,
	)
	return uc, requestRepo, teamRepo, teamApproverRepo, userRepo
}

func pendingRequest(id, teamID, requestedBy string) *entity.ApprovalRequest {
	return &entity.ApprovalRequest{
		ID:          id,
		ActionType:  entity.ApprovalActionToggleCreate,
		RequestedBy: requestedBy,
		TeamID:      teamID,
		Status:      entity.ApprovalStatusPending,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}
}

func TestApprovalUseCase_ApproveRequest(t *testing.T) {
	t.Run("root can approve any team's request", func(t *testing.T) {
		uc, requests, _, _, users := newApprovalUseCaseForAccessTests()
		req := pendingRequest("req-1", "team-a", "requester-1")
		requests.Requests[req.ID] = req
		root := &entity.User{ID: "root-1", Role: entity.UserRoleRoot}
		users.Users[root.ID] = root

		if err := uc.ApproveRequest(context.Background(), req.ID, root); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if requests.Requests[req.ID].Status != entity.ApprovalStatusApproved {
			t.Errorf("expected request to be approved, got status %q", requests.Requests[req.ID].Status)
		}
	})

	t.Run("approver of the team can approve", func(t *testing.T) {
		uc, requests, _, teamApprovers, users := newApprovalUseCaseForAccessTests()
		req := pendingRequest("req-2", "team-a", "requester-1")
		requests.Requests[req.ID] = req
		approver := &entity.User{ID: "approver-1", Role: entity.UserRoleAdmin}
		users.Users[approver.ID] = approver
		teamApprovers.Approvers["team-a"] = map[string]bool{"approver-1": true}

		if err := uc.ApproveRequest(context.Background(), req.ID, approver); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("approver of a different team is denied", func(t *testing.T) {
		uc, requests, _, teamApprovers, users := newApprovalUseCaseForAccessTests()
		req := pendingRequest("req-3", "team-a", "requester-1")
		requests.Requests[req.ID] = req
		approver := &entity.User{ID: "approver-1", Role: entity.UserRoleAdmin}
		users.Users[approver.ID] = approver
		teamApprovers.Approvers["team-b"] = map[string]bool{"approver-1": true}

		err := uc.ApproveRequest(context.Background(), req.ID, approver)
		if err == nil || err.Error() != "user is not an approver for this team" {
			t.Fatalf("expected 'user is not an approver for this team', got %v", err)
		}
		if requests.Requests[req.ID].Status != entity.ApprovalStatusPending {
			t.Errorf("expected request to remain pending, got %q", requests.Requests[req.ID].Status)
		}
	})

	t.Run("plain member (not approver) is denied", func(t *testing.T) {
		uc, requests, _, _, users := newApprovalUseCaseForAccessTests()
		req := pendingRequest("req-4", "team-a", "requester-1")
		requests.Requests[req.ID] = req
		member := &entity.User{ID: "member-1", Role: entity.UserRoleAdmin}
		users.Users[member.ID] = member

		err := uc.ApproveRequest(context.Background(), req.ID, member)
		if err == nil || err.Error() != "user is not an approver for this team" {
			t.Fatalf("expected 'user is not an approver for this team', got %v", err)
		}
	})

	t.Run("cannot approve own request even as the team's approver", func(t *testing.T) {
		uc, requests, _, teamApprovers, users := newApprovalUseCaseForAccessTests()
		req := pendingRequest("req-5", "team-a", "approver-1")
		requests.Requests[req.ID] = req
		approver := &entity.User{ID: "approver-1", Role: entity.UserRoleAdmin}
		users.Users[approver.ID] = approver
		teamApprovers.Approvers["team-a"] = map[string]bool{"approver-1": true}

		err := uc.ApproveRequest(context.Background(), req.ID, approver)
		if err == nil || err.Error() != "user cannot approve this request" {
			t.Fatalf("expected self-approval rejection, got %v", err)
		}
	})
}

func TestApprovalUseCase_RejectRequest(t *testing.T) {
	t.Run("approver of a different team is denied", func(t *testing.T) {
		uc, requests, _, teamApprovers, users := newApprovalUseCaseForAccessTests()
		req := pendingRequest("req-1", "team-a", "requester-1")
		requests.Requests[req.ID] = req
		approver := &entity.User{ID: "approver-1", Role: entity.UserRoleAdmin}
		users.Users[approver.ID] = approver
		teamApprovers.Approvers["team-b"] = map[string]bool{"approver-1": true}

		err := uc.RejectRequest(context.Background(), req.ID, approver, "not today")
		if err == nil || err.Error() != "user is not an approver for this team" {
			t.Fatalf("expected 'user is not an approver for this team', got %v", err)
		}
	})

	t.Run("root can reject any team's request", func(t *testing.T) {
		uc, requests, _, _, users := newApprovalUseCaseForAccessTests()
		req := pendingRequest("req-2", "team-a", "requester-1")
		requests.Requests[req.ID] = req
		root := &entity.User{ID: "root-1", Role: entity.UserRoleRoot}
		users.Users[root.ID] = root

		if err := uc.RejectRequest(context.Background(), req.ID, root, "no"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if requests.Requests[req.ID].Status != entity.ApprovalStatusRejected {
			t.Errorf("expected request to be rejected, got %q", requests.Requests[req.ID].Status)
		}
	})
}

func TestApprovalUseCase_WithdrawRequest(t *testing.T) {
	t.Run("requester can withdraw their own pending request", func(t *testing.T) {
		uc, requests, _, _, users := newApprovalUseCaseForAccessTests()
		req := pendingRequest("req-1", "team-a", "requester-1")
		requests.Requests[req.ID] = req
		requester := &entity.User{ID: "requester-1", Role: entity.UserRoleAdmin}
		users.Users[requester.ID] = requester

		if err := uc.WithdrawRequest(context.Background(), req.ID, requester); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if _, exists := requests.Requests[req.ID]; exists {
			t.Errorf("expected the request to be deleted, still present")
		}
	})

	t.Run("someone other than the requester cannot withdraw it, even root", func(t *testing.T) {
		uc, requests, _, _, users := newApprovalUseCaseForAccessTests()
		req := pendingRequest("req-2", "team-a", "requester-1")
		requests.Requests[req.ID] = req
		root := &entity.User{ID: "root-1", Role: entity.UserRoleRoot}
		users.Users[root.ID] = root

		err := uc.WithdrawRequest(context.Background(), req.ID, root)
		if err == nil || err.Error() != "only the requester can withdraw this request" {
			t.Fatalf("expected 'only the requester can withdraw this request', got %v", err)
		}
		if _, exists := requests.Requests[req.ID]; !exists {
			t.Errorf("expected the request to remain, was deleted")
		}
	})

	t.Run("cannot withdraw a request that is no longer pending", func(t *testing.T) {
		uc, requests, _, _, users := newApprovalUseCaseForAccessTests()
		req := pendingRequest("req-3", "team-a", "requester-1")
		req.Status = entity.ApprovalStatusApproved
		requests.Requests[req.ID] = req
		requester := &entity.User{ID: "requester-1", Role: entity.UserRoleAdmin}
		users.Users[requester.ID] = requester

		err := uc.WithdrawRequest(context.Background(), req.ID, requester)
		if err == nil || err.Error() != "approval request is not pending" {
			t.Fatalf("expected 'approval request is not pending', got %v", err)
		}
	})
}

func TestApprovalUseCase_GetTeamsWithoutApprover(t *testing.T) {
	t.Run("returns only the caller's own teams that have zero approvers", func(t *testing.T) {
		uc, _, teams, teamApprovers, _ := newApprovalUseCaseForAccessTests()
		teams.Teams["team-a"] = &entity.Team{ID: "team-a", Name: "Payments"}
		teams.Teams["team-b"] = &entity.Team{ID: "team-b", Name: "Growth"}
		teams.TeamsByUser["user-1"] = []string{"team-a", "team-b"}
		// team-a has an approver, team-b doesn't.
		teamApprovers.Approvers["team-a"] = map[string]bool{"admin-1": true}
		teamApprovers.Approvers["team-b"] = map[string]bool{"member-1": false}

		result, err := uc.GetTeamsWithoutApprover(context.Background(), "user-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(result) != 1 || result[0].ID != "team-b" {
			t.Fatalf("expected only team-b, got %+v", result)
		}
	})

	t.Run("a team with no recorded members at all counts as having no approver", func(t *testing.T) {
		uc, _, teams, _, _ := newApprovalUseCaseForAccessTests()
		teams.Teams["team-c"] = &entity.Team{ID: "team-c", Name: "Platform"}
		teams.TeamsByUser["user-2"] = []string{"team-c"}

		result, err := uc.GetTeamsWithoutApprover(context.Background(), "user-2")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(result) != 1 || result[0].ID != "team-c" {
			t.Fatalf("expected team-c, got %+v", result)
		}
	})

	t.Run("returns an empty list when every team already has an approver", func(t *testing.T) {
		uc, _, teams, teamApprovers, _ := newApprovalUseCaseForAccessTests()
		teams.Teams["team-a"] = &entity.Team{ID: "team-a", Name: "Payments"}
		teams.TeamsByUser["user-1"] = []string{"team-a"}
		teamApprovers.Approvers["team-a"] = map[string]bool{"admin-1": true}

		result, err := uc.GetTeamsWithoutApprover(context.Background(), "user-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(result) != 0 {
			t.Fatalf("expected no teams, got %+v", result)
		}
	})
}

func TestApprovalUseCase_ExecuteApprovedAction(t *testing.T) {
	approvedRequest := func(id, teamID, requestedBy string) *entity.ApprovalRequest {
		req := pendingRequest(id, teamID, requestedBy)
		approverID := "someone-else"
		req.Status = entity.ApprovalStatusApproved
		req.ActionedBy = &approverID
		// Unsupported action type on purpose: these tests only need to prove the access-control
		// gate fires BEFORE dispatch — reaching the switch would require wiring ToggleUseCase etc.
		req.ActionType = entity.ApprovalActionType("unsupported_for_test")
		return req
	}

	t.Run("non-approver is denied before any dispatch happens — the bug this fixes", func(t *testing.T) {
		uc, requests, _, _, users := newApprovalUseCaseForAccessTests()
		req := approvedRequest("req-1", "team-a", "requester-1")
		requests.Requests[req.ID] = req
		stranger := &entity.User{ID: "stranger-1", Role: entity.UserRoleUser}
		users.Users[stranger.ID] = stranger

		err := uc.ExecuteApprovedAction(context.Background(), req.ID, stranger)
		if !errors.Is(err, ErrApprovalAccessDenied) {
			t.Fatalf("expected ErrApprovalAccessDenied, got %v", err)
		}
	})

	t.Run("approver of a different team is denied", func(t *testing.T) {
		uc, requests, _, teamApprovers, users := newApprovalUseCaseForAccessTests()
		req := approvedRequest("req-2", "team-a", "requester-1")
		requests.Requests[req.ID] = req
		approver := &entity.User{ID: "approver-1", Role: entity.UserRoleAdmin}
		users.Users[approver.ID] = approver
		teamApprovers.Approvers["team-b"] = map[string]bool{"approver-1": true}

		err := uc.ExecuteApprovedAction(context.Background(), req.ID, approver)
		if !errors.Is(err, ErrApprovalAccessDenied) {
			t.Fatalf("expected ErrApprovalAccessDenied, got %v", err)
		}
	})

	t.Run("root passes the access gate (fails later, on the unsupported action type)", func(t *testing.T) {
		uc, requests, _, _, users := newApprovalUseCaseForAccessTests()
		req := approvedRequest("req-3", "team-a", "requester-1")
		requests.Requests[req.ID] = req
		root := &entity.User{ID: "root-1", Role: entity.UserRoleRoot}
		users.Users[root.ID] = root

		err := uc.ExecuteApprovedAction(context.Background(), req.ID, root)
		if errors.Is(err, ErrApprovalAccessDenied) {
			t.Fatalf("root should never be denied by the access gate, got %v", err)
		}
		if err == nil {
			t.Fatal("expected an error from the unsupported action type dispatch, got nil")
		}
	})

	t.Run("approver of the team passes the access gate too", func(t *testing.T) {
		uc, requests, _, teamApprovers, users := newApprovalUseCaseForAccessTests()
		req := approvedRequest("req-4", "team-a", "requester-1")
		requests.Requests[req.ID] = req
		approver := &entity.User{ID: "approver-1", Role: entity.UserRoleAdmin}
		users.Users[approver.ID] = approver
		teamApprovers.Approvers["team-a"] = map[string]bool{"approver-1": true}

		err := uc.ExecuteApprovedAction(context.Background(), req.ID, approver)
		if errors.Is(err, ErrApprovalAccessDenied) {
			t.Fatalf("team approver should never be denied by the access gate, got %v", err)
		}
	})
}

func TestApprovalUseCase_GetApprovalRequest(t *testing.T) {
	t.Run("root can read any team's request", func(t *testing.T) {
		uc, requests, _, _, _ := newApprovalUseCaseForAccessTests()
		requests.Requests["req-1"] = pendingRequest("req-1", "team-a", "requester-1")
		root := &entity.User{ID: "root-1", Role: entity.UserRoleRoot}

		if _, err := uc.GetApprovalRequest(context.Background(), "req-1", root); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("member of the team can read it", func(t *testing.T) {
		uc, requests, teams, _, _ := newApprovalUseCaseForAccessTests()
		requests.Requests["req-1"] = pendingRequest("req-1", "team-a", "requester-1")
		member := &entity.User{ID: "member-1", Role: entity.UserRoleUser}
		teams.TeamsByUser[member.ID] = []string{"team-a"}

		if _, err := uc.GetApprovalRequest(context.Background(), "req-1", member); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("non-member is denied — surfaced as 404 by the handler, not 403", func(t *testing.T) {
		uc, requests, _, _, _ := newApprovalUseCaseForAccessTests()
		requests.Requests["req-1"] = pendingRequest("req-1", "team-a", "requester-1")
		stranger := &entity.User{ID: "stranger-1", Role: entity.UserRoleUser}

		_, err := uc.GetApprovalRequest(context.Background(), "req-1", stranger)
		if !errors.Is(err, ErrApprovalAccessDenied) {
			t.Fatalf("expected ErrApprovalAccessDenied, got %v", err)
		}
	})
}

func TestApprovalUseCase_GetAllApprovalRequests(t *testing.T) {
	uc, requests, teams, _, _ := newApprovalUseCaseForAccessTests()
	requests.Requests["req-a"] = pendingRequest("req-a", "team-a", "requester-1")
	requests.Requests["req-b"] = pendingRequest("req-b", "team-b", "requester-2")

	t.Run("root sees every team's requests", func(t *testing.T) {
		root := &entity.User{ID: "root-1", Role: entity.UserRoleRoot}
		results, err := uc.GetAllApprovalRequests(context.Background(), root)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 2 {
			t.Errorf("expected 2 requests for root, got %d", len(results))
		}
	})

	t.Run("non-root only sees their own teams' requests", func(t *testing.T) {
		member := &entity.User{ID: "member-1", Role: entity.UserRoleUser}
		teams.TeamsByUser[member.ID] = []string{"team-a"}

		results, err := uc.GetAllApprovalRequests(context.Background(), member)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 1 || results[0].TeamID != "team-a" {
			t.Errorf("expected only team-a's request, got %+v", results)
		}
	})

	t.Run("a user with no teams sees nothing, not everything", func(t *testing.T) {
		loneUser := &entity.User{ID: "lone-1", Role: entity.UserRoleUser}
		results, err := uc.GetAllApprovalRequests(context.Background(), loneUser)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 0 {
			t.Errorf("expected no requests, got %d", len(results))
		}
	})
}

func TestApprovalUseCase_GetApprovalRequestsByTeam(t *testing.T) {
	uc, requests, teams, _, _ := newApprovalUseCaseForAccessTests()
	requests.Requests["req-a"] = pendingRequest("req-a", "team-a", "requester-1")

	t.Run("member of the team can read it", func(t *testing.T) {
		member := &entity.User{ID: "member-1", Role: entity.UserRoleUser}
		teams.TeamsByUser[member.ID] = []string{"team-a"}

		results, err := uc.GetApprovalRequestsByTeam(context.Background(), "team-a", member)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(results) != 1 {
			t.Errorf("expected 1 request, got %d", len(results))
		}
	})

	t.Run("non-member is denied", func(t *testing.T) {
		stranger := &entity.User{ID: "stranger-1", Role: entity.UserRoleUser}
		_, err := uc.GetApprovalRequestsByTeam(context.Background(), "team-a", stranger)
		if !errors.Is(err, ErrApprovalAccessDenied) {
			t.Fatalf("expected ErrApprovalAccessDenied, got %v", err)
		}
	})
}

func TestApprovalUseCase_CreateApprovalRequest(t *testing.T) {
	uc, _, teams, _, users := newApprovalUseCaseForAccessTests()
	settingsRepo := uc.approvalSettingsRepo.(*MockApprovalSettingsRepository)
	settingsRepo.RequiresApprovalResult = true

	team := &entity.Team{ID: "team-a", Name: "Team A"}
	teamRepoConcrete := uc.teamRepo.(*MockTeamRepository)
	teamRepoConcrete.Teams[team.ID] = team

	requester := &entity.User{ID: "requester-1", Role: entity.UserRoleUser}
	users.Users[requester.ID] = requester

	t.Run("requester must belong to the team they're filing against", func(t *testing.T) {
		_, err := uc.CreateApprovalRequest(context.Background(), entity.ApprovalActionToggleCreate, "desc", requester.ID, team.ID, nil, nil, nil)
		if !errors.Is(err, ErrApprovalAccessDenied) {
			t.Fatalf("expected ErrApprovalAccessDenied, got %v", err)
		}
	})

	t.Run("succeeds once the requester is a member", func(t *testing.T) {
		teams.TeamsByUser[requester.ID] = []string{team.ID}
		_, err := uc.CreateApprovalRequest(context.Background(), entity.ApprovalActionToggleCreate, "desc", requester.ID, team.ID, nil, nil, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

// v2.6 §6.6: "Suggest a change" precisa criar uma solicitação mesmo quando o action_type
// correspondente NÃO está configurado pra exigir aprovação (required_actions.toggle_enable
// desligado) — é a única forma de um role read-only propor uma mudança, então o gate normal de
// CreateApprovalRequest não pode se aplicar aqui.
func TestApprovalUseCase_CreateSuggestion(t *testing.T) {
	uc, requests, teams, _, users := newApprovalUseCaseForAccessTests()
	settingsRepo := uc.approvalSettingsRepo.(*MockApprovalSettingsRepository)
	settingsRepo.RequiresApprovalResult = false // o ponto central deste teste

	team := &entity.Team{ID: "team-a", Name: "Team A"}
	teamRepoConcrete := uc.teamRepo.(*MockTeamRepository)
	teamRepoConcrete.Teams[team.ID] = team

	requester := &entity.User{ID: "requester-1", Role: entity.UserRoleUser}
	users.Users[requester.ID] = requester
	teams.TeamsByUser[requester.ID] = []string{team.ID}

	t.Run("creates a request even when the action type doesn't require approval", func(t *testing.T) {
		request, err := uc.CreateSuggestion(
			context.Background(), entity.ApprovalActionToggleEnable, "Suggested: enable toggle", requester.ID, team.ID, nil, nil, nil,
		)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if request.Status != entity.ApprovalStatusPending {
			t.Errorf("expected a pending request, got status %q", request.Status)
		}
		if len(requests.Requests) != 1 {
			t.Fatalf("expected the request to be persisted, got %d", len(requests.Requests))
		}
	})

	t.Run("still enforces team membership, same access rule as CreateApprovalRequest", func(t *testing.T) {
		outsider := &entity.User{ID: "outsider-1", Role: entity.UserRoleUser}
		users.Users[outsider.ID] = outsider

		_, err := uc.CreateSuggestion(context.Background(), entity.ApprovalActionToggleEnable, "desc", outsider.ID, team.ID, nil, nil, nil)
		if !errors.Is(err, ErrApprovalAccessDenied) {
			t.Fatalf("expected ErrApprovalAccessDenied, got %v", err)
		}
	})
}
