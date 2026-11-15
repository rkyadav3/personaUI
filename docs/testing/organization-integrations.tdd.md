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
- Independent Standards and Spec reviews passed after fixing default workspace selection; Stage 1 pushed.

Existing tests emit React server-rendering useLayoutEffect warnings; no new failing tests were introduced.

## Stage 2 — organization experience

- RED checkpoints: 5cc5c68, 6c4361d, f15de5a (organization UI, measured uploads, executable schema, source policies and runtime scope).
- GREEN: 530 tests pass; production build passes. Actual workspaces and organization SQL migrations execute and rerun in local PostgreSQL/PGlite.
- Browser: organization selection, grounded draft review, confirmation, failed-save draft preservation and retry, source audience changes and 390px viewport fit pass using intercepted local requests.
- Independent Standards/Spec review fixes: deny non-administrator mutations, verify private media membership and suspension, check enquiry workspace status, remove unsupported organization detail claims, merge additional detail fields, refresh source-policy cache.
- Hosted SQL is user-managed. The user explicitly elected to use the SQL Editor themselves; no dashboard access is required.

## Stage 3 — authenticated website connections

- RED: three integration specifications initially failed for missing credential/API/migration implementation.
- GREEN: 534 tests pass; production build passes. Actual migration runs twice in PostgreSQL/PGlite; admission/replay executes as service_role with BYPASSRLS.
- Verified: random hashed scoped keys, expiry/revocation, server source assignment, shared monthly admission, idempotent pending/completed results, changed-message rejection, public-knowledge cache invalidation and counter-only update compatibility.
- Browser: create connection, failed-save input preservation, one-time key dismissal, disable/enable and mobile fit. Installed widget recovers with a new ID after a confirmed terminal failure.
- Review fixes: explicit terminal-retry metadata, retained provider token evidence after history failure, cache invalidation for changed source/profile access and date validity, helper execute permission under service_role.
