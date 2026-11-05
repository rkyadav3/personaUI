# Offering categories and Profile Q&A: TDD evidence

Journeys were derived from the user's three requests; no source plan was supplied.

## User journeys

- An owner creates or edits an offering, selects one of their contribution categories, and finds the saved offering under that category.
- An owner reviews visitors' questions and the persona's exact replies in Admin, including records older than the latest 50 questions.
- An owner can distinguish an unanswered question, an older record whose reply was never stored, an empty history and a failed history load.
- Research Topics and Templates have an implementation discussion based on their current behavior, without expanding their functionality before the product decisions are made.

## RED and GREEN

`node --test tests/profile-management.test.js tests/profile-management-ui.test.cjs` was run before implementation and exited 1. The offering selector and Q&A navigation were missing; `chat.list` returned 404; generated, fallback and error replies were absent from the recorded rows; and failed history writes still returned a successful chat. After implementation, the same command passed all 17 initial tests.

Additional boundary tests exposed malformed request arguments and raw database errors. `node --test tests/profile-management.test.js` then recorded 21 tests, 18 passes and 3 failures. After adding argument validation and migration/error handling, all 21 service/API tests passed. The UI suite adds another 5 passing tests.

The TDD skill requests local Git checkpoint commits. A sandboxed commit attempt failed because `.git/index.lock` could not be created; the approval escalation was not executed because the automatic approval service returned 503. No checkpoint commits were created. This report preserves the observed RED/GREEN evidence instead.

## Behavioral guarantees

| Guarantee | Test evidence | Type | Result |
|---|---|---|---|
| Owner category options include custom subtypes and preselect the starting or saved category | `profile-management-ui.test.cjs` | Rendered UI | PASS |
| A saved offering uses its selected category ID, reloads in that category, and drops unknown details | `profile-management.test.js` | Service integration with scripted DB | PASS |
| An unavailable category cannot create an offering | `profile-management.test.js` | Service integration | PASS |
| Q&A reads require a session and use the signed-in owner's scoped DB, ignoring a supplied owner ID | `profile-management.test.js` | Admin API integration | PASS |
| History requests page 2 using range 50–99 with stable date/ID ordering | `profile-management.test.js` | Repository integration | PASS |
| Invalid pages and malformed arguments are rejected; missing schema reports the migration; other DB errors are sanitized | `profile-management.test.js` | Repository/API integration | PASS |
| Public Chat records owner, bounded question, exact reply, sources and answered status | `profile-management.test.js` | API integration with mocked external fetch | PASS |
| Missing notes, retrieval failures, model no-answer replies and generation fallbacks retain the corresponding response | `profile-management.test.js` | API integration | PASS |
| Failed HTTP or network history writes return a retryable error instead of a successful unrecorded response | `profile-management.test.js` | API integration | PASS |
| Invalid questions, unknown profiles and excess requests do not create history rows | `profile-management.test.js` | API integration | PASS |
| Q&A navigation is available to ordinary owners; replies render as escaped text; loading/errors/empty/legacy records remain distinct | `profile-management-ui.test.cjs` | Rendered UI | PASS |

## Final verification

- `node --test tests/*.test.js tests/*.test.cjs`: **240/240 pass**, no skipped tests.
- `node --test --experimental-test-coverage --test-coverage-include=api/chat.js --test-coverage-include=server/chatHistory.js tests/profile-management.test.js`: **100% lines, 94% branches, 100% functions** for the changed chat/history modules.
- `node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run test:coverage`: **240/240 pass**, **97.64% lines, 86.54% branches, 89.20% functions** across the existing configured coverage targets. Those targets do not include the two modules measured separately above.
- Production build: `node --input-type=module -e "import { build } from 'vite'; import react from '@vitejs/plugin-react'; await build({configFile:false,plugins:[react()]});"`: **PASS**, 891 modules transformed. This applies the project's build configuration directly. The standard `npm` launcher references a missing user-level npm CLI, and Vite's config bundler was denied access to an ancestor directory in this sandbox.
- `git diff --check`: **PASS**. New routes, source rendering, authenticated dispatch, tenant table inclusion, schema ordering and all changed files were manually reviewed.
- Typecheck/lint: no TypeScript or lint scripts are configured in this JavaScript repository.

## Deployment and unverified checks

Apply `supabase/profile-questions.sql` after `schema.sql` and `multitenant.sql`, before deploying the code. The migration was prepared and reviewed but was not applied to a live database. Historical replies were never stored and cannot be recovered.

Browser E2E was attempted against the local Vite server. Automatic approval review returned 503 before browser navigation was executed, so no browser interaction, visual QA or live end-to-end result is claimed. Authentication/API integrations use scripted databases and external-service mocks; UI assertions use React's rendered markup. The browser check and Git checkpoints require a functioning approval service to finish.
