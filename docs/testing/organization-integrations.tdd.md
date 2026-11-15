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

## Stage 4 — Super Admin operations

- RED: platform access/health tests initially failed for the missing operations module.
- GREEN: 537 passing tests and production build. Operations SQL runs twice and executes under service_role.
- Verified: normal-admin denial, workspace status synchronization, atomic quota/settings change plus audit, failed-limit rollback, actual measured counts and unknown/stale provider health.
- Browser: limit form error preserves input; successful retry, workspace suspension and external API stop/restore work at desktop/mobile sizes.
- Review refinements: represented profile names sync into workspace directory; audit shows before/changed values; rejection counters expose their actual hourly-bucket window.

## Stage 5 — teams, signed events and lifecycle

- RED: four added regression cases reproduced invited-admin adapter 401, invalid Articles export column, old invitations undoing revocation, and retention dropping queued webhook jobs. Later RED cases reproduced retained expired Assistant review content, cross-workspace browser recovery, unbound stale-tab operations, and scope metadata rejected by production Assistant validators.
- GREEN: 549 complete tests pass. Eight collaboration cases execute actual PostgreSQL/PGlite migrations, including studio-assistant/studio-chat and reruns. Thirteen session cases verify browser review recovery. Three scope tests cover stale-tab rejection before reads/writes, scope caching/reset, and production history/prepare/apply validators after scope metadata consumption.
- Single SQL block: all five add-on migrations were combined in memory under one transaction, installed and rerun in PGlite, then maintenance ran under service_role. No standalone combined SQL file was saved, as requested.
- Browser: email-bound team links survive sign-in; save failures preserve team/webhook drafts; one-time secrets dismiss correctly; endpoint disable works; viewers cannot reach restricted tools or mutate files/knowledge; JSON export downloads; original loading spinner is restored. A fresh mobile browser context measured innerWidth=390, scrollWidth=390, and body copy=16px; desktop and reduced-motion primitives remain compatible.
- Security review: pinned DNS/HTTPS targets, exact-byte HMAC with timestamp checks, encrypted signing secrets, credential-only external entry point, private shared Assistant scope, and signed body event-ID deduplication. No remaining code blockers after fixes.
- Deployment: testing checkpoint 47eef64 is READY on Vercel with 12 functions. GET /api/persona reaches the authenticated Persona handler and rejects 405. POST without activation returns the explicit disabled-feature response; maintenance without configuration rejects before any database work.
- Hosted evidence remains separate: SQL installation, feature flag/worker secrets, real connected-site chat and scheduled deliveries must be verified by the operator before production approval.
