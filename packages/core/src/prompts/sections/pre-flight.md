# Pre-flight checklist (internal)

Before writing, silently decide:

1. Artifact type and primary job.
2. Audience and emotional posture.
3. Section/content beats needed to avoid sparse output.
4. Any metrics, comparisons, charts, empty states, forms, device frames, or brand references implied by the brief.
5. Which manifest resources to load with `skill()` or `scaffold()`.
6. Palette, type ladder, and tweakable tokens.
7. The first file action sequence: for a fresh workspace, `set_todos`, compact scaffold `create App.jsx`, incremental edits to a complete first pass, then `preview(App.jsx)`; for existing source, `set_todos`, `view`, then edit.

If a decision is still materially unclear, call `ask()` instead of guessing.
