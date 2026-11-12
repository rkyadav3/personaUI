# Full current-code review — 12 November 2026

Scope: all first-party API handlers, server modules, shared domain/normalization modules, database migrations, React pages/components/helpers/styles, build/deployment configuration and relevant tests. Generated assets, dependencies and third-party code were excluded. The review covers the current uncommitted workspace; existing changes were preserved. The user's dashboard requests are the specification. No repository AGENTS.md, CODING_STANDARDS.md or CONTRIBUTING.md was found; README and setup/testing documents supplied the documented behavior.

The installed Matt Pocock code-review skill supplied separate fresh-context Standards and Spec reviewers. Impeccable supplied the UI refinement guidance. Findings below distinguish corrected issues from pre-existing issues still open. The absence of a finding is not a production certification.

## Standards

Corrected:

- **Critical: service-role storage path traversal.** `server/store.js` previously accepted any path beginning with the account prefix. Dot segments could normalize outside the object directory, including into REST routes. Upload registration now accepts only the single UUID object filename issued by the server, with an optional alphanumeric extension, before any download. Tests reject traversal, encoded segments, query/fragment suffixes and malformed paths, and exercise a valid upload without credentials or network access.
- **High: public signup could establish owner access.** An unused configured SuperAdmin email could be registered without proving email ownership. Public registration now rejects privileged emails before database access. Owner accounts require trusted provisioning; existing owners still sign in.
- **High: unpublished knowledge could remain retrievable.** Assistant saves and failed syncs could leave old chunks for draft sources. `supabase/knowledge-visibility.sql` gates both vector and keyword retrieval against current source publication and tenant, removes chunks on unpublish/delete and cleans existing stale chunks. Activation requires applying the migration; its PostgreSQL execution has not been tested locally.
- **Medium: legacy background save deleted the existing image before saving.** `saveSettings` now uses the established save-before-cleanup path. Failed writes and images retained as portraits are covered by regressions.
- **Medium: custom public tags stopped enquiries and tracking.** Those lookups now fetch computed privacy; public tags work and private tags still fail closed.

Open pre-existing findings:

| Priority | Location | Trigger and consequence | Recommended correction |
| --- | --- | --- | --- |
| P1 | `server/auth.js:118` | Five concurrent wrong-password requests can all read `failed_attempts=0` and write `1`; the documented five-attempt lock is bypassed. The reviewer reproduced this using the real module with offline responses. | Increment and establish the lock atomically in PostgreSQL; preserve concurrent suspension/password changes. |
| P1 | `server/studioAssistant.js:86` | Two distinct reviews can both validate the same settings snapshot before claiming their own review. Both report applied, but the second full settings write overwrites the first. Reproduced using the real service and a synchronization barrier. | Serialize writes per owner and check current data inside that protection; use conditional/versioned writes for concurrent editor saves. |
| P2 | `server/indexer.js:16` | A later batch failure leaves earlier chunks with the new source hash. Hash-only retry and sync checks can treat that partial index as complete. This was traced in source; not fault-injected against PostgreSQL. | Make chunk replacement atomic or mark/check a completed source generation before skipping it. |
| P2 | `supabase/home.sql:36` | Rating votes are inserted and aggregated before the offering row is locked. Concurrent different voters can leave cached totals below the vote table totals. This is a transaction-ordering finding; live PostgreSQL concurrency was not executed. | Lock the offering row before inserting the vote and recomputing its totals. |

No speculative style-smell findings are elevated above these behavioral risks. Repeated image-save logic was removed as part of the confirmed correctness fix.

## Spec

The frontend reviewer reported no outstanding high-confidence Spec finding after checking the current corrections:

- Restored Add offering in category headers, alongside the new top Add category action.
- Keyed offering forms by record ID so editing B after A does not submit A's values to B.
- Resolved registered labels on both directory cards and public profiles.
- Preserved edits made while an older homepage save is pending, with an explicit remaining-unsaved message.
- Prevented hosted checkout from opening after the checkout component unmounts during script loading.
- Queued activity refresh when an admin returns while another activity request is pending.

Reviewed exclusive account routing, customer management, public/private tags, invitations and attribution, admin-only suggestions, owner sales/settings, live preview, public account controls, Contact-page preservation, admin navigation, activity recap and factual assistant panels. The dashboard's activity includes contact-form enquiries; no external email-provider inbox integration was requested or added. Financial values are ledger sales/net earnings rather than gateway payouts.

## Verification and limits

- Complete Node suite: **413 passing, 0 failing, 0 skipped**.
- Production Vite build: successful.
- Tags/activity/governance module coverage: **100% lines, 82.56% branches, 86.67% functions**. This is not overall application coverage.
- Earlier browser checks passed for actual unsaved directory preview, no preview tracking, activity dismissal/reopening/fade, assistant data-table display and mobile category/Settings navigation. Those checks use local API fixtures.
- The extended browser check, including the added regressions, could not execute because automatic approval review returned `content-blocked` twice. The tool stated this was an approval-review failure, not a safety determination. Local regression tests and build verification continued; post-fix browser verification remains unconfirmed.
- No PostgreSQL server/CLI or SQL parser was available. SQL checks assert intended guards/trigger structure; migration application, execution and concurrent database behavior remain deployment checks.
- The JavaScript project has no lint/typecheck command. Runtime tests, source review and the build were used; lint/typecheck was not claimed.

Standards: four open pre-existing findings, worst priority P1. Spec: zero outstanding high-confidence findings after corrections. The Standards findings remain visible independently of Spec completion.
