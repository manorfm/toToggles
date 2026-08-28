package middleware

import (
	"testing"
)

func TestAllowKillSwitchRequest_BlocksAfter30PerKey(t *testing.T) {
	key := "test-key-id-1"
	for i := 0; i < 30; i++ {
		if !AllowKillSwitchRequest(key) {
			t.Fatalf("expected attempt %d to be allowed", i+1)
		}
	}
	if AllowKillSwitchRequest(key) {
		t.Error("expected the 31st attempt within the window to be blocked")
	}
}

func TestAllowKillSwitchRequest_TracksEachKeyIndependently(t *testing.T) {
	keyA := "test-key-id-a"
	keyB := "test-key-id-b"

	for i := 0; i < 30; i++ {
		AllowKillSwitchRequest(keyA)
	}
	if AllowKillSwitchRequest(keyA) {
		t.Error("expected keyA to be exhausted")
	}
	if !AllowKillSwitchRequest(keyB) {
		t.Error("a different secret key must have its own independent counter")
	}
}
