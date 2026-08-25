package entity

import "testing"

func TestUser_RefreshStatus(t *testing.T) {
	tests := []struct {
		name               string
		active             bool
		mustChangePassword bool
		wantStatus         string
	}{
		{"active user, password already set", true, false, "active"},
		{"active user, still on the temporary password", true, true, "pending_first_login"},
		{"disabled user takes priority over pending_first_login", false, true, "disabled"},
		{"disabled user, password already set", false, false, "disabled"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			u := &User{Active: tt.active, MustChangePassword: tt.mustChangePassword}
			u.RefreshStatus()

			if u.Status != tt.wantStatus {
				t.Errorf("RefreshStatus() = %q, want %q", u.Status, tt.wantStatus)
			}
		})
	}
}

func TestUser_AfterFind_ComputesStatus(t *testing.T) {
	u := &User{Active: true, MustChangePassword: true}

	if err := u.AfterFind(nil); err != nil {
		t.Fatalf("AfterFind() error = %v", err)
	}

	if u.Status != "pending_first_login" {
		t.Errorf("Status after AfterFind() = %q, want %q", u.Status, "pending_first_login")
	}
}
