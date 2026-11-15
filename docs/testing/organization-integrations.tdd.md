# Organization and integration verification

Source: ../organization-integrations.plan.md and the approved conversation.

## Stage 1 — workspace foundation

- RED: `node --test tests/workspaces.test.js` executed four tests and failed because the workspace module and migration were not implemented. Checkpoint: 8efd37d.
- GREEN: five workspace tests pass, including execution and repeat execution of the actual migration using PGlite/PostgreSQL.
- Guarantees: authenticated membership, trusted actor, role/status checks, foreign-workspace rejection, preserved existing IDs/URLs, automatic workspace stamping and transactional one-time setup.
- Compatibility: existing owner_id references remain during migration; workspace-scoped callers validate membership and enforce both owner_id and workspace_id. Existing storage paths remain valid.
- Complete suite: 512 tests pass; no failures/skips. Production Vite build passes.
- Workspace module coverage: 96.43% lines, 95% branches, 100% functions, measured with `node --test --experimental-test-coverage --test-coverage-include=server/workspaces.js tests/workspaces.test.js`.
- Hosted database: migration has not yet been applied. Local execution is not a hosted deployment claim.
- Independent review and stage push: pending.

Existing tests emit React server-rendering useLayoutEffect warnings; no new failing tests were introduced.
