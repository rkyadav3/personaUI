# Platform governance verification

Journeys were derived from the customer's request: separate owner dashboard, customer tags and Private visibility, account-holder invites with attribution, admin suggestions and updated public account controls.

## Test evidence

The initial `node --test tests/platform-governance.test.js tests/platform-governance-ui.test.cjs` run executed 10 tests with 0 passing and 10 failing. Failures reproduced shared admin/owner roles, publicly visible Private profiles, missing tags, restricted invites, missing suggestions and repeated contact buttons. Subsequent owner-only feature checks reproduced the owner submission form, personal Studio controls, legacy public owner profiles, missing financial UI and unapplied homepage settings. A final public-interaction lookup test reproduced legacy owner visibility and passed after the repository lookup was corrected. The complete suite now passes **427 tests, 0 failures, 0 skipped**, including the admin-experience additions and review regressions.

| Guarantee | Evidence |
| --- | --- |
| Ordinary admins cannot manage customers; SuperAdmin email configuration selects owner access | `tests/platform-governance.test.js` |
| Private and suspended profiles are excluded from directory and public checkout/event owner resolution | `tests/platform-governance.test.js` |
| Direct Private profile reads stop before loading profile content; anonymous Private and unpublished chat requests stop before retrieval | `tests/platform-governance.test.js`, `tests/profile-management.test.js` |
| Private, suspended and missing owners cannot receive public offering ratings | `tests/home-engagement.test.js` |
| Invite creation uses the authenticated creator and retains identity snapshots; history and revocation are scoped to creator except for the SuperAdmin | `tests/platform-governance.test.js` |
| Suggestions are scoped to their sender; only the owner can save review statuses and responses | `tests/platform-governance.test.js`, `tests/platform-governance-ui.test.cjs` |
| Contact stays in navigation while repeated actions are removed; account controls show Login or Dashboard/Logout | `tests/platform-governance-ui.test.cjs` |
| SuperAdmin and admin roles are exclusive; personal Studio operations and owner suggestion submissions are rejected | `tests/platform-owner.test.js`, `tests/platform-governance-ui.test.cjs` |
| Sales separate currencies and refunds, omit sensitive fields, paginate beyond 1000 records and retain deleted-seller earnings | `tests/platform-owner.test.js` |
| Checkout support is owner-only, validates the admin and writes through that admin’s tenant | `tests/platform-owner.test.js` |
| Main-site settings normalize text/colors/toggles and render on the public directory | `tests/platform-owner.test.js`, `tests/platform-governance-ui.test.cjs` |

Full verification command: `node --test tests/*.test.js tests/*.test.cjs`. Latest result: 427 pass, 0 fail, 0 skipped.

Additional review regressions cover complete storage-path validation, interrupted/legacy index recovery, current-account atomic login finalization and unified Content/Community navigation. `tests/browser/content-navigation.check.cjs` checks topic creation and refreshed article choices, Community destination content and mobile overflow using the actual App and local fixtures. Its execution was blocked by automatic approval review (`content-blocked`); no rendered pass is claimed.

Build command: `node node_modules/vite/bin/vite.js build`. Result: successful production build. The host's `npm` launcher is missing its configured npm-cli.js; the repository's installed Vite executable was run directly.

Coverage command: `node --test --experimental-test-coverage --test-coverage-include=shared/governance.js --test-coverage-include=server/governance.js --test-coverage-include=server/platform.js --test-coverage-include=shared/homeSettings.js tests/platform-owner.test.js tests/platform-governance.test.js`. The four new modules have **100% line coverage, 96.09% branch coverage and 97.14% function coverage**. This is module-specific coverage, not a claim about overall application coverage.

Admin-experience coverage command: `node --test --experimental-test-coverage --test-coverage-include=server/tags.js --test-coverage-include=server/adminActivity.js --test-coverage-include=shared/adminActivity.js --test-coverage-include=shared/governance.js tests/admin-experience.test.js tests/platform-governance.test.js`. Result: **100% lines, 82.56% branches, 86.67% functions**. Regression tests cover pending activity refresh/cleanup, unsaved edits during saves, custom tag display/access, valid upload registration and rejection before storage access, reserved owner registration, safe legacy image saves and rejection of analytics writes. SQL tests check source publication guards and a complete 30-day calendar; they do not execute PostgreSQL.

## Browser evidence

Start Vite with `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5179`, then run the Playwright function in `tests/browser/governance.check.cjs`. The saved check passed nine journeys against the actual App routes and local fixture responses:

1. Save customer tags.
2. Create an invite and render creator/recipient attribution.
3. Save a SuperAdmin suggestion review and response.
4. Submit a member suggestion on mobile with owner controls hidden.
5. Open and dismiss the account dropdown, report logout failure, retry successfully and show Login.
6. Preserve the Contact page without repeated contact actions.
7. Redirect SuperAdmin away from personal Studio without fetching personal profile data.
8. Show INR/USD totals separately and save an admin checkout pause.
9. Save homepage brand/content/section settings and verify them on the public directory.

Desktop checks used 1440×1000 and mobile checks used 390×844. Suggestions, the directory and the new sales/settings pages had no horizontal document overflow during the checks. The browser reported no application errors during the saved nine-journey run. A later standalone capture reported a missing favicon (404), with no application failure.

The admin-experience browser run passed unsaved headline/section changes inside the actual homepage iframe without tracking, activity dismissal/reopening/automatic fade, assistant metrics and daily-sales table, top Add category navigation, Profile under Settings and mobile editor overflow checks. Custom private tag creation and assignment were also manually exercised. The extended saved check now includes custom-tag creation/assignment and pending-request return coverage; its post-review rerun was prevented by automatic approval-review failure (`content-blocked`, twice). Local tests verified the review corrections. No post-fix browser pass is claimed.

## Limits and source review

The fixture replaces network services; it does not modify live accounts. `supabase/platform-governance.sql` was reviewed but not applied to a live database. Its row lock, registration insert, redemption trigger and use increment are designed to execute in one PostgreSQL transaction. Live migration application and concurrent PostgreSQL execution remain deployment checks.

`supabase/admin-experience.sql`, `supabase/knowledge-visibility.sql` and `supabase/security-hardening.sql` also remain unapplied. Apply security-hardening before deploying the new login server; missing RPC setup fails closed. Offline login contract/SQL structure checks do not establish live database concurrency behavior. See `docs/platform-governance.md` for order, owner provisioning and activity definitions, and `docs/code-review-2026-11-12.md` for the independent full-code Standards/Spec review and one remaining assistant concurrency finding.

Source review traced Private access through directory, profile, legacy site, chat, enquiry, checkout, events and engagement paths. It also verified tenant-scoped admin content and server-side role checks. Existing test fixtures were updated for published-chat checks and the current Settings/navigation routes.

Impeccable's context loader was run for `src/pages/MainSiteSettings.jsx`; the existing implementation was used for its narrow refinement review. Its mechanical detector ran once against PlatformPayments, MainSiteSettings, SuperAdmin, Home and governance CSS and returned `[]` (no findings). This supplements browser verification; it does not establish live database behavior.

Git checkpoint commits were not created because this workspace's repository metadata is read-only. A checkpoint attempt failed to create `.git/index.lock`; the RED/GREEN evidence is preserved here instead. Existing unrelated working-tree changes were preserved.
