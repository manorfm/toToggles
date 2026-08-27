// Package toggle holds the rich domain types shared by the cache, the server-fetch layer, and
// the activation-rule strategies: a Toggle path is hierarchical (service.feature.flag) and its
// evaluation semantics (root-to-target cascading) are a real domain rule, not incidental string
// plumbing — modeling it here keeps that rule defined exactly once.
package toggle

import (
	"encoding/json"
	"errors"
	"strings"
)

// ErrEmptyPath is returned by NewPath for an empty string.
var ErrEmptyPath = errors.New("toggle path must not be empty")

// ErrEmptyPathSegment is returned by NewPath when any dot-separated segment is empty (e.g.
// leading/trailing/consecutive dots).
var ErrEmptyPathSegment = errors.New("toggle path must not contain an empty segment")

// Path is a validated, dot-separated toggle path (e.g. "service.feature.flag"). It is never
// empty and never has an empty segment — those are the only two things that make a raw path
// string invalid, checked once here instead of ad hoc everywhere a path is used.
type Path struct {
	value string
}

// NewPath validates and wraps a raw path string.
func NewPath(raw string) (Path, error) {
	if raw == "" {
		return Path{}, ErrEmptyPath
	}
	for _, seg := range strings.Split(raw, ".") {
		if seg == "" {
			return Path{}, ErrEmptyPathSegment
		}
	}
	return Path{value: raw}, nil
}

func (p Path) String() string { return p.value }

// Segments splits the path into its dot-separated parts, e.g. "a.b.c" -> ["a", "b", "c"].
func (p Path) Segments() []string {
	return strings.Split(p.value, ".")
}

// AncestorPaths returns every proper prefix of this path, root first — for "a.b.c" that's
// ["a", "a.b"]. Empty for a single-segment path (it has no ancestors).
func (p Path) AncestorPaths() []Path {
	segments := p.Segments()
	ancestors := make([]Path, 0, len(segments)-1)
	for i := 1; i < len(segments); i++ {
		ancestors = append(ancestors, Path{value: strings.Join(segments[:i], ".")})
	}
	return ancestors
}

// MarshalJSON encodes a Path as the plain string it wraps.
func (p Path) MarshalJSON() ([]byte, error) {
	return json.Marshal(p.value)
}

// UnmarshalJSON decodes a plain JSON string into a validated Path — an invalid path in the
// payload fails the decode instead of producing a Path that silently can't be looked up.
func (p *Path) UnmarshalJSON(data []byte) error {
	var raw string
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	parsed, err := NewPath(raw)
	if err != nil {
		return err
	}
	*p = parsed
	return nil
}
