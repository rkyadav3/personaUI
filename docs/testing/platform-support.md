# Platform Support verification — 14 November 2026

Community is now labeled Invite. Support is a Settings destination for admins and a separate SuperAdmin inbox, without giving the owner a personal Studio.

The initial Support tests failed against the missing service/page and unchanged navigation. After implementation, the backend and rendered-markup checks passed. Review found and corrected late navigation after a request form unmounted and draft loss on refresh failure. Lifecycle regressions verify navigation suppression, busy release and preservation of the loaded list component/cache.

- `tests/platform-support.test.js`: authenticated ownership on create/list/detail, no foreign-thread reads, exclusive owner inbox, service-only trusted actor/status updates, validation and visible errors. SQL source checks cover isolation, ticket locking and reopening. These do not execute PostgreSQL.
- `tests/platform-support-ui.test.cjs`: Invite label, Settings placement, detail route selection, owner inbox, request links, escaped conversation text and owner-only status controls.
- `tests/support-lifecycle.test.cjs`: delayed creation after navigation, successful creation, refresh failure preserving component identity/cache, and retrying conversation reads without sending another reply. These use an offline hook harness, not a live DOM.
- `tests/browser/platform-support.check.cjs`: saved actual-App journeys for creation before onboarding, replies, retry/draft preservation, reopening, owner status/history, refresh/navigation races and mobile overflow. The local fixture intercepts network calls and never writes to real accounts.

Complete Node suite: **462 passing, 0 failing, 0 skipped**. Production Vite build succeeds. Commands: `node --test tests/*.test.js tests/*.test.cjs` and `node node_modules/vite/bin/vite.js build`.

Browser execution was attempted on 14 November 2026 and blocked by automatic approval review (`content-blocked`); the action was not executed. The saved browser check is source-reviewed, and no rendered desktop/mobile pass is claimed. `supabase/platform-support.sql` must be applied after `registration.sql`; live database execution and concurrency remain unverified.
