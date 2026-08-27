package toggle

// Application is the full set of toggles fetched for one app, indexed for O(1) path lookup. It
// owns the path-cascade logic (AncestorsOf) once, instead of each caller (cache, client) walking
// segments itself.
type Application struct {
	Toggles []Toggle
	byPath  map[string]Toggle
}

// NewApplication indexes toggles by path for lookup.
func NewApplication(toggles []Toggle) Application {
	byPath := make(map[string]Toggle, len(toggles))
	for _, tg := range toggles {
		byPath[tg.Path.String()] = tg
	}
	return Application{Toggles: toggles, byPath: byPath}
}

// ByPath looks up the toggle at an exact path.
func (a Application) ByPath(p Path) (Toggle, bool) {
	tg, ok := a.byPath[p.String()]
	return tg, ok
}

// AncestorsOf returns every toggle on the path from root to (but not including) p that is present
// in this Application, root first. An ancestor segment that was never configured is skipped
// rather than treated as an error — it simply doesn't contribute to the cascade.
func (a Application) AncestorsOf(p Path) []Toggle {
	ancestorPaths := p.AncestorPaths()
	ancestors := make([]Toggle, 0, len(ancestorPaths))
	for _, ap := range ancestorPaths {
		if tg, ok := a.byPath[ap.String()]; ok {
			ancestors = append(ancestors, tg)
		}
	}
	return ancestors
}
