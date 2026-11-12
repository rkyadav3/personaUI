# Full current-code review — 12 November 2026

Scope: all first-party API handlers, server modules, shared domain/normalization modules, database migrations, React pages/components/helpers/styles, build/deployment configuration and relevant tests. Generated assets, dependencies and third-party code were excluded. The review covers the current uncommitted workspace; existing changes were preserved. The user's dashboard requests are the specification. No repository AGENTS.md, CODING_STANDARDS.md or CONTRIBUTING.md was found; README and setup/testing documents supplied the documented behavior.

The installed Matt Pocock code-review skill supplied separate fresh-context Standards and Spec reviewers. Impeccable supplied the UI refinement guidance. Findings below distinguish corrected issues from pre-existing issues still open. The absence of a finding is not a production certification.

## Standards

Corrected:

- **Critical: service-role storage path traversal.** `server/store.js` previously accepted any path beginning with the account prefix. Dot segments could normalize outside the object directory, including into REST routes. Storage operations now accept only an owner-prefixed single UUID filename, with an optional alphanumeric extension. Generated names are also validated, and upload batches are validated before any signing request. Registration, reads, overwrites and deletion share the guard. Tests reject traversal, encoded segments, query/fragment suffixes and malformed legacy paths, and exercise valid operations without credentials or network access.
- **High: public signup could establish owner access.** An unused configured SuperAdmin email could be registered without proving email ownership. Public registration now rejects privileged emails before database access. Owner accounts require trusted provisioning; existing owners still sign in.
- **High: unpublished knowledge could remain retrievable.** Assistant saves and failed syncs could leave old chunks for draft sources. `supabase/knowledge-visibility.sql` gates both vector and keyword retrieval against current source publication and tenant, removes chunks on unpublish/delete and cleans existing stale chunks. Activation requires applying the migration; its PostgreSQL execution has not been tested locally.
- **Medium: legacy background save deleted the existing image before saving.** `saveSettings` now uses the established save-before-cleanup path. Failed writes and images retained as portraits are covered by regressions.
- **Medium: custom public tags stopped enquiries and tracking.** Those lookups now fetch computed privacy; public tags work and private tags still fail closed.
- **High: concurrent login failures bypassed the attempt lock.** `finalize_login` locks the current account row, validates the credentials against the bcrypt snapshot, increments failures atomically and preserves concurrent suspension/reset/deletion. The server authenticates from the finalized account. Apply `security-hardening.sql` before deploying: missing RPC setup intentionally prevents sign-in. Offline contract and SQL structure tests pass; live SQL execution remains unverified.
- **Medium: partial indexes could be mistaken for complete sources.** New chunks retain a unique build marker until all batches succeed. Retry and sync check chunk counts, unique ordinals and the final source hash. Fault-injection tests recover interrupted batches and repair legacy partial/duplicate indexes.
- **Medium: concurrent ratings could leave stale cached totals.** `security-hardening.sql` locks the offering before inserting/updating a vote and aggregating totals. Static checks pass; live PostgreSQL concurrency remains unverified.

Open pre-existing findings:

| Priority | Location | Trigger and consequence | Recommended correction |
| --- | --- | --- | --- |
| P1 | `server/studioAssistant.js:86` | Two distinct reviews can both validate the same settings snapshot before claiming their own review. Both report applied, but the second full settings write overwrites the first. Reproduced using the real service and a synchronization barrier. | Serialize writes per owner and check current data inside that protection; use conditional/versioned writes for concurrent editor saves. |

No speculative style-smell findings are elevated above these behavioral risks. Repeated image-save logic was removed as part of the confirmed correctness fix.

## Spec

The frontend reviewer reported no outstanding high-confidence Spec finding after checking the current corrections:

- Restored Add offering in category headers, alongside the new top Add category action.
- Keyed offering forms by record ID so editing B after A does not submit A's values to B.
- Resolved registered labels on both directory cards and public profiles.
- Preserved edits made while an older homepage save is pending, with an explicit remaining-unsaved message.
- Prevented hosted checkout from opening after the checkout component unmounts during script loading.
- Queued activity refresh when an admin returns while another activity request is pending.
- Consolidated Articles, Templates and Research topics under one Content destination, with accessible shared tabs and refreshed article topic choices after topic creation.
- Moved Invite links and Suggestions from Settings into Community without duplicate sidebar links. Legacy content routes remain supported.

Reviewed exclusive account routing, customer management, public/private tags, invitations and attribution, admin-only suggestions, owner sales/settings, live preview, public account controls, Contact-page preservation, admin navigation, activity recap and factual assistant panels. The dashboard's activity includes contact-form enquiries; no external email-provider inbox integration was requested or added. Financial values are ledger sales/net earnings rather than gateway payouts.

## Verification and limits

- Complete Node suite: **427 passing, 0 failing, 0 skipped**.
- Production Vite build: successful.
- Tags/activity/governance module coverage: **100% lines, 82.56% branches, 86.67% functions**. This is not overall application coverage.
- Earlier browser checks passed for actual unsaved directory preview, no preview tracking, activity dismissal/reopening/fade, assistant data-table display and mobile category/Settings navigation. Those checks use local API fixtures.
- The extended browser check, including the added regressions, could not execute because automatic approval review returned `content-blocked` twice. The tool stated this was an approval-review failure, not a safety determination. Local regression tests and build verification continued; post-fix browser verification remains unconfirmed.
- The saved Content/Community browser check also could not execute due to `content-blocked`. Its fixture now supports invitation/suggestion reads and asserts the destination page content; it has been source-reviewed, not browser-verified.
- No PostgreSQL server/CLI or SQL parser was available. SQL checks assert intended guards/trigger structure; migration application, execution and concurrent database behavior remain deployment checks.
- The JavaScript project has no lint/typecheck command. Runtime tests, source review and the build were used; lint/typecheck was not claimed.

Standards: one open pre-existing finding, priority P1 (assistant concurrency). Spec: zero outstanding high-confidence runtime findings after corrections. The Standards finding remains visible independently of Spec completion.
