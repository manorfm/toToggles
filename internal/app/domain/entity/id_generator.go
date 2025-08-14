package entity

import (
	"math/rand"
	"time"

	"github.com/oklog/ulid/v2"
)

// generateULID gera um ID único baseado em timestamp
func generateULID() string {
	t := time.Now().UTC()
	e := ulid.Monotonic(rand.New(rand.NewSource(t.UnixNano())), 0)
	return ulid.MustNew(ulid.Timestamp(t), e).String()
}