@AGENTS.md

# ORCA Frontend — Claude instructions

Read the complete `convention.md` before analysis, edits or review. For changes under `src/`,
also read `src/AGENTS.md`; UI work requires `docs/DESIGN_SYSTEM.md`, and authorization/navigation
work requires `docs/RBAC_UI_SCOPE.md`. These sources supplement the imported root rules.

Use the seven ORCA roles and TENANT/PLATFORM scopes through `src/lib/accessPolicy.ts`. Do not
restore the old four-role model, union actor scopes, invent grants or treat screen access as
permission for every action. Keep field privacy across payloads, cache, export and labels.

The working SRS baseline and DB handoff are identified in `AGENTS.md`. Schema availability does
not imply that the backend API or ORCA workflow exists. Preserve existing repository names,
aliases, routes and `--sc-*` tokens unless the task changes them. Run the quality checks required
for the actual scope and report runtime checks separately from Markdown checks.
