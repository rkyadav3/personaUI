# Admin history and public Chat layout: verification evidence

Journeys were derived from the user's request; no source plan was supplied.

## User journeys

- An owner returns to Admin and sees saved questions and replies belonging to their account.
- New exchanges appear at the top of the existing conversation box, with each question above its reply. The typing form keeps its position above the conversation box.
- An owner loads older messages inside the same box, with explicit loading, error, retry and unsaved states.
- A public visitor types in a taller chat panel with the composer near the bottom of the visible viewport. Enter sends, Shift+Enter inserts a line, and IME composition does not submit prematurely.

## RED and GREEN

Before production edits, `node --test tests/studio-chat-history.test.js tests/chat-layout-ui.test.cjs tests/studio-assistant.test.js` failed on the intended missing behavior: `studio.history` returned 404; there was no history repository or migration; reload restored no messages; `loadOlder` did not exist; generated exchanges were not saved; and the public composer was a single-line input before the suggestions. New UI tests also exercised the missing conversation component.

After implementation, the focused history, layout, session and assistant suites passed **63/63 tests**. Additional recovery, disposal, unsaved-exchange and keyboard-input checks increased the focused suites to **67/67 passing tests**.

The user elected to handle Git manually during the earlier work. No separate RED/GREEN checkpoint commits were created for this task. This report preserves the observed evidence before the subsequently requested combined commit and push.

The later combined commit/push was attempted by staging the specific task files. Automatic approval review returned **503 Service Unavailable** before `git add` executed. No commit or push was created by that attempt.

## Behavioral guarantees

| Guarantee | Evidence | Type | Result |
| --- | --- | --- | --- |
| History is private, tenant-scoped, and inaccessible to unsigned API callers or direct browser database clients | `studio-chat-history.test.js` | Repository/API integration and migration assertions | PASS |
| Completed commands, read answers and clarifications save exact question/reply pairs | `studio-assistant.test.js` | Service integration | PASS |
| Transcript failures retain the pending review, show safe errors and mark live exchanges as unsaved | `studio-assistant.test.js`, `studio-chat-history.test.js` | Service/session integration | PASS |
| Newest-first keyset pagination is stable when new messages arrive | `studio-chat-history.test.js` | Repository integration | PASS |
| Reload restores chronological model context while display reverses exchanges | `studio-chat-history.test.js`, `chat-layout-ui.test.cjs` | Session integration and rendered React UI | PASS |
| Older-page loads preserve new replies, deduplicate overlaps and ignore disposed sessions | `studio-chat-history.test.js` | Session integration | PASS |
| Visible history retains loaded exchanges while model context stays at six recent messages | `studio-chat-history.test.js` | Session integration | PASS |
| Admin typing stays above its conversation box; public typing follows the suggested questions | `chat-layout-ui.test.cjs` | Rendered React UI | PASS |
| Viewport sizing includes keyboard offsets; Enter, Shift+Enter and IME behavior are distinguished | `chat-layout-ui.test.cjs` | Unit and rendered React UI | PASS |

## Final verification

- `node --test tests/*.test.js tests/*.test.cjs`: **298/298 pass**, zero skipped tests.
- `node --test --experimental-test-coverage --test-coverage-include=server/studioChatHistory.js --test-coverage-include=server/studioAssistant.js --test-coverage-include=src/lib/studioSession.js --test-coverage-include=src/lib/chatLayout.js tests/studio-chat-history.test.js tests/studio-assistant.test.js tests/studio-session.test.js tests/chat-layout-ui.test.cjs`: **98.71% lines, 86.59% branches, 92.06% functions** across the focused modules. The new history repository, session module and viewport/keyboard helpers have 100% line coverage.
- Production build: `node --input-type=module -e "import { build } from 'vite'; import react from '@vitejs/plugin-react'; await build({configFile:false,plugins:[react()]});"`: **PASS**, 895 modules transformed, 9.61 seconds. This uses the project's React build settings directly because the standard config loader is restricted by ancestor-directory access in this sandbox.
- No TypeScript or lint scripts are configured. No new package dependencies were introduced.
- Browser fixture: `tests/browser/chat.html` renders the real components with local mock APIs for future desktop/mobile interaction checks. Navigation was attempted, but automatic approval review returned **503 Service Unavailable** before execution. Browser interaction, visual layout and real mobile-keyboard behavior remain unverified. No alternative browser mechanism was used to bypass that approval check.

## Deployment requirements and limits

Apply `supabase/studio-chat.sql` after `supabase/studio-assistant.sql`, before deploying. The migration has not been applied to a live database. History saves completed exchanges; old chats and failed planning requests were not persisted. History recovery cannot automatically replay mutations.

Vercel/Razorpay setup is documented in `docs/vercel-environment-setup.md`. The generated local secrets remain only in the ignored `.env.local` file. Razorpay provider credentials still need to be entered privately, and Vercel settings have not been changed by this task.
