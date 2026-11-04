# Admin command assistant TDD evidence

Journeys were derived from the user's request: the Overview chatbot should read and perform CRUD across the admin panel, with a review before every mutation. No plan document was supplied. This incremental task starts from `9a0b43ac93c14d24ab73e56351e7d31ab28463b9`, after the unified Portfolio refactor.

## Journeys

- An owner asks the Overview assistant to read, create, edit or delete admin content using a natural-language command.
- A mutation produces a saved review containing the exact proposed values and deletion effects. Planning does not execute content writes.
- The owner approves or discards the review. Only the saved server plan is applied, once, under the current signed-in owner and permissions.
- Follow-up commands clarify or revise a proposal. Date commands use the browser's timezone.
- Failed or interrupted operations retain an audit trail, show completed and unapplied steps, and do not automatically retry writes. Leaving the page or changing owners suppresses late UI updates.

## Checkpoints

All listed commits belong to this task's active staging branch, `admin-command-assistant`, and are reachable from its HEAD. They are staging checkpoints; they do not prove application to the Desktop repository.

| Commit | Stage | Executed evidence |
|---|---|---|
| `22626fc` | RED: review-first planning, approval, validation and markup | 28 failing cases |
| `b9f0fe0` | GREEN: initial planner, service and review UI | 28 passing cases |
| `f737497` | RED: persistence, profile IDs, stable array targets and types | 43 cases; 13 fail |
| `65c8730` | GREEN: private repository and CRUD validation | 43 pass |
| `3dd7271` | RED: production adapters and matching preview values | 38 cases; 24 fail |
| `69790c6` | GREEN: existing admin services connected | 73 combined cases pass |
| `55adbbd` | RED: client recovery, timezone and safe errors | 72 cases; 17 fail |
| `3870a3b` | GREEN: owner-bound client session and recovery | 76 cases, including markup, pass |
| `6b91294` | RED: model choices, parent references and index progress | 34 cases; 3 fail |
| `112add3` | RED: safe reference records in planning context | 35 cases; 4 fail |
| `ff43fad` | GREEN: choices, references and index continuation notices | 35 pass |
| `2ca3470` | RED: expired approval should give feedback | 12 cases; 1 fail |
| `a0011fe` | GREEN: expiry feedback without an approval request | 12 pass |
| `cd8ef00` | RED: owner read details and safe payment readiness | 19 cases; 1 fail |
| `f79dc62` | GREEN: complete operational read fields | 19 pass |

Counts above come from executed test output. The messages of `55adbbd` and `6b91294` contain count typos; their actual RED results were 72/17 and 34/3 respectively.

Focused commands actually run:

```text
node --test tests/studio-assistant.test.js tests/studio-assistant-ui.test.cjs tests/studio-reviews.test.js
node --test --test-reporter=tap tests/studio-operations.test.js tests/studio-planner-validation.test.js tests/gemini-timeout.test.js tests/studio-reviews.test.js
node --test --test-reporter=tap tests/studio-session.test.js tests/studio-assistant.test.js tests/studio-reviews.test.js tests/studio-planner-validation.test.js
node --test --test-reporter=tap tests/studio-planner-validation.test.js tests/studio-operations.test.js tests/gemini-timeout.test.js
node --test --test-reporter=tap tests/studio-session.test.js
node --test --test-reporter=tap tests/studio-planner-validation.test.js
```

Combined GREEN runs also included `tests/studio-assistant-ui.test.cjs`. The final suite uses the complete declared test list.

## Guarantees

| Guarantee | Evidence | Type | Result |
|---|---|---|---|
| Preparing changes writes a pending review and executes no content operation; reading creates no mutation review | `studio-assistant.test.js` | Service with injected model/repository | PASS |
| Approval requires `approved: true`; injected client actions cannot replace the saved plan | `studio-assistant.test.js`, `studio-session.test.js` | Service / client state | PASS |
| Overlapping or repeated approvals cannot execute the same review twice | `studio-assistant.test.js` | Concurrent service requests | PASS |
| Another owner, expired review, discarded review, changed data or revoked Super Admin permissions cannot approve | `studio-assistant.test.js`, `studio-reviews.test.js` | Service / repository | PASS |
| Repository reads and conditional claims include owner, ID, pending status and expiry filters; progress/result writes require running status | `studio-reviews.test.js` | Query-recording repository integration | PASS |
| Missing review setup gives the migration path; unexpected API/repository/model failures do not expose private details | `studio-reviews.test.js`, `studio-assistant.test.js` | API / service / repository | PASS |
| All supported operation names dispatch through existing owner-scoped admin services; unknown operations and mismatched areas are rejected | `studio-operations.test.js` | Adapter integration with recorded services | PASS |
| Profile updates use the real ID and one validated write; profile removal retains other roots | `studio-operations.test.js`, `studio-assistant.test.js` | Existing profile service with scripted DB | PASS |
| Post title/status, post template changes and approved file moves are persisted; old editor defaults are retained | `studio-operations.test.js` | Existing store with scripted DB | PASS |
| Portfolio, Look, Persona, background and portrait changes merge into one save; original array targets remain stable after deletion | `studio-assistant.test.js`, `studio-planner-validation.test.js` | Planner | PASS |
| Required fields, enums, nested types, prices, owner references and unsafe keys are validated before review | `studio-planner-validation.test.js`, `studio-assistant.test.js` | Planner | PASS |
| Cascading deletion previews include child folders/files, category offerings and Event attendance; conflicting parent/child edits require separate reviews | `studio-assistant.test.js`, `studio-planner-validation.test.js` | Planner | PASS |
| Existing access links and omitted content remain intact; generated HTML is escaped; HTML appends preserve existing markup | `studio-assistant.test.js`, `studio-planner-validation.test.js` | Planner | PASS |
| Purchases preserve financial status/amount; only fulfillment and private notes are editable | `studio-assistant.test.js`, `studio-operations.test.js` | Planner / adapter | PASS |
| Read context includes buyers, counts, enquiries, attendance notes and safe readiness while omitting delivery links, passwords and credentials | `studio-assistant.test.js`, `studio-planner-validation.test.js`, `studio-operations.test.js` | Snapshot / planner | PASS |
| Both model calls use bounded history and the browser timezone; Gemini fetch receives the shared timeout signal | `studio-assistant.test.js`, `gemini-timeout.test.js`, `studio-session.test.js` | Service / mocked fetch / client state | PASS |
| UI state restores review IDs, handles lost approval responses through reads, blocks duplicate requests, and ignores late results after disposal | `studio-session.test.js` | Client controller | PASS |
| Review markup displays before/after values, warnings, approval/discard controls and escaped text | `studio-assistant-ui.test.cjs` | React rendered markup | PASS |
| A failed execution or audit save stops later steps and identifies steps not attempted; knowledge jobs report pending work | `studio-assistant.test.js`, `studio-operations.test.js` | Service / adapter | PASS |
| Existing Portfolio Chat, Events, RSVP, free/paid shop and payment tests remain passing | Full test suite | Existing unit / integration / markup | PASS |

## Final verification

- **214 tests passed; 0 failed; 0 skipped.** The declared `test:coverage` command from `package.json` was run directly with Node, adding only the TAP reporter. The local wrapper was `node ../verify-admin-assistant.cjs`.
- Coverage across the explicitly included files: **97.64% lines, 86.54% branches, 89.20% functions**. Prior coverage targets are retained. This task adds `server/studioAssistant.js`, `studioPlan.js`, `studioOperations.js`, `studioReviews.js`, `gemini.js`, `shared/studioAssistant.js` and `src/lib/studioSession.js`.
- Production build: `node ../portfolio-studio-preview.mjs --build`; **889 modules transformed**, build passed. The runner uses the installed Vite/React pipeline with environment loading disabled and an isolated fixture. No production credentials or payment/database calls are used.
- `git diff --check` passed. The project has no lint or TypeScript check script; JSX compilation is covered by the production build.
- Manual review followed command input through selection, validation, saved review, explicit approval, atomic claim, fixed operation dispatch and result persistence. No shell execution or arbitrary database/API tool is exposed to the model. Credentials stay on the server and are omitted from model context.

## Verification limits

Browser navigation to `http://127.0.0.1:5174/admin` was not executed. Automatic approval review returned HTTP 503 because its `gpt-5.6-luna` reviewer service had no available channel. No browser workaround bypassed that check. Interactive browser layout, real Gemini interpretation, Supabase migration execution/persistence and live Razorpay calls are not claimed.

Client controller tests prove async state behavior; rendered-markup tests prove content and attributes. They do not substitute for browser interaction or visual inspection. React SSR `useLayoutEffect` warnings remain separate from passing test results. Coverage is for the declared targets, not every legacy module or all React components. Existing upload helpers and full live backend wrappers retain integration gaps that should be checked against the configured app.

The update requires `supabase/studio-assistant.sql`, described in `docs/admin-assistant-setup.md`. Staging commits and this evidence report are included so the RED/GREEN record survives transfer as a patch.
