# Events and profile shop

Journeys come from the user's request in this chat.

- A profile owner creates an Event with a visitor response form in Updates & Schedule.
- A visitor answers Going or Not going; the owner's profile shows counts and consenting names.
- Only that owner can read the full responses in their admin panel.
- The profile home page shows every visible free and paid shop item.
- A free claim is recorded without opening a payment gateway.
- A paid purchase uses the app's one shared Razorpay account and the price stored on the server.
- Checkout requires an access/download link, which is released with the confirmation only after completion.
- Signature, order, amount, currency and captured payment checks precede fulfillment.
- Duplicate checkout requests and repeated payment notifications do not duplicate purchases.
- A private access link is returned only with a completed purchase and its receipt token.
- The owner can inspect purchases, buyer details, totals and fulfillment status in the admin panel.

## Result

89 tests passed, 0 failed, 0 skipped. The sandbox-safe production Vite build transformed 883 modules and completed successfully. The final Node coverage run reported 99.47% lines, 88.14% branches and 91.15% functions across the new event/commerce services, repositories, HTTP APIs and browser helpers. This is feature coverage, not whole-application or interactive UI coverage.

## Test specification

| Behavior guaranteed | Test target | Kind | Result |
| --- | --- | --- | --- |
| Portrait crop settings reach the uploaded photo; removal restores initials | `tests/profile-ui.test.cjs` | rendering | PASS |
| Every visible shop item and published Event renders on both profile styles | `tests/profile-ui.test.cjs`, `tests/shop.test.js` | rendering / unit | PASS |
| Public catalog retains access readiness without revealing the private link | `tests/shop.test.js` | unit | PASS |
| Event dates, custom questions, required phone and attendance choices are validated | `tests/events.test.js`, `tests/rsvp.test.js` | unit | PASS |
| Event responses belong to the correct owner; public summaries exclude contacts and answers | `tests/rsvp-service.test.js`, `tests/repositories.test.js` | service / repository | PASS |
| A valid private edit token updates an existing response rather than duplicating it | `tests/rsvp-service.test.js` | service | PASS |
| Free claims finish without a gateway; paid checkout uses the server price and shared account | `tests/payments.test.js`, `tests/repositories.test.js` | service / repository | PASS |
| Wrong signatures, orders, currencies and amounts cannot complete a purchase | `tests/payments.test.js` | service | PASS |
| Duplicate requests, repeated callbacks and webhooks do not duplicate completion | `tests/payments.test.js` | service | PASS |
| Receipt recovery can complete a captured payment when notifications were missed | `tests/payments.test.js` | service | PASS |
| Signed refund updates use the cumulative gateway amount; fully refunded receipts omit access | `tests/payments.test.js` | service | PASS |
| Credentials are encrypted and bound to the owner and purchase | `tests/payment-crypto.test.js`, `tests/repositories.test.js` | unit / repository | PASS |
| Owner admin data includes buyers, references, totals, pagination and fulfillment controls | `tests/repositories.test.js`, `tests/profile-ui.test.cjs` | repository / rendering | PASS |
| Private access links survive editing existing offerings | `tests/profile-ui.test.cjs` | rendering | PASS |
| Invalid public bodies and unexpected failures do not leak server details | `tests/api-flows.test.js`, `tests/http.test.js` | HTTP integration | PASS |
| The Razorpay script can retry a failed load; native checkout is suspended for the hosted payment surface | `tests/public-actions.test.js`, `tests/profile-ui.test.cjs` | helper / rendering | PASS |

## RED / GREEN checkpoints

All listed checkpoints are reachable on the staging repository's current `main` branch for this task. No commits were made in the original desktop repository.

- `cc52f16` captured Event/catalog RED cases; `5708e91` made the initial 8 cases GREEN.
- `52ae4b7` captured checkout security and Event response RED cases; `bc74de4` and `e10ad25` implemented services and tenant storage.
- `565160b` captured public-data and reserved-field validation RED cases.
- `1f9bcc2` captured the profile home rendering failure; it stopped at the fourth shop item and omitted Events.
- `aad4f00` captured public readiness and receipt-helper RED cases; `e67dd82` made the 12 profile/helper cases GREEN.
- `e4d1671` captured Classic profile, Event editor and migration-message RED cases; `1c97795` completed them with 56 tests GREEN.
- `9fd9858` captured the native dialog suspension RED case; `74d0f55` made that case GREEN.
- `a71880b` captured HTTP body/error privacy RED cases and repository integration tests; the implementation passed the same 19 API/repository/HTTP cases.
- `3560998` captured lowercase currency and access-editor RED cases; the final implementation passed those cases and the complete 89-test suite.

The relevant targets were run with `node --test tests/*.test.js tests/*.test.cjs`. The focused RED commands are named by their targets above. The final coverage command is the exact `test:coverage` script in `package.json`; it was executed directly through Node because the sandbox's `npm` launcher points to a missing global npm installation.

## Verification and limits

| Check | Outcome |
| --- | --- |
| Tests | PASS: 89/89, no skips |
| Feature coverage | PASS: 99.47% lines, 88.14% branches, 91.15% functions |
| Production bundle | PASS: `node dev-preview.mjs --build`, sandbox-only helper using the existing Vite/React build options |
| Ordinary build invocation in this sandbox | Environment blocked: missing npm launcher target; direct config bundling also hits an ancestor-directory access restriction |
| Types / lint | No TypeScript project or lint script is configured; the production bundle compiled JSX and modules |
| Diff whitespace | PASS: `git diff --check` |
| Sensitive data review | Public catalog omits delivery links; secrets remain server-only; raw `.env` was not copied |
| Browser interaction / visual E2E | Not run: automatic approval review returned HTTP 503 before browser navigation was executed |
| Supabase SQL execution | Not run: no configured test PostgreSQL/Supabase database was available |
| Real Razorpay payment / webhook | Not run: automated tests use isolated query and gateway fixtures |

Classic rendering tests emit the existing LiquidGlass `useLayoutEffect` server-render warning. The application is a client-rendered Vite app; the warning is recorded rather than treated as an interactive browser result.

The combined deliverable patch is compared against the untouched original repository, including the circular-avatar changes already present in the staging baseline. Deployment, database migration and live payments require the configuration and test-mode checks in `docs/events-shop-setup.md`.
