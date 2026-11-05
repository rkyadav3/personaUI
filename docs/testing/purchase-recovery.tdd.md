# Historical purchase recovery: TDD evidence

Journeys came from the user's report that entering a previously used purchase email and choosing Check receipt still said no purchase was found. Investigation showed that Check receipt used only a browser-local request ID and secret token; it never searched by the entered email. The user selected email plus the original Razorpay payment ID as the recovery proof, using the existing payment setup.

## User journeys and guarantees

- A buyer restores an older paid purchase in a new browser using the purchase email and original payment ID.
- The lookup accepts legacy email capitalization/whitespace, matches the selling profile and exact item, and has no date cutoff.
- The restored browser receipt survives later checks without replacing the original checkout token.
- A pending order whose captured callback was missed can be verified and completed through its stored order.
- Incorrect proof, other profiles/items, refunds, rate limits and gateway errors do not release private access links.
- Checkout exposes a separate recovery form with field errors, and Check receipt opens it when no browser receipt exists.

## RED and GREEN

`node --test tests/purchase-recovery.test.js tests/purchase-recovery-ui.test.cjs` initially failed on the missing recovery service/client functions and UI, and the API returned 400 for the missing recovery action. After implementation, all **15/15** initial tests passed.

A follow-up refunded-payment test reproduced a captured-but-fully-refunded gateway response incorrectly allowing pending-order recovery. `node --test tests/purchase-recovery.test.js` recorded **13 tests, 12 passes and 1 failure**. The fix checks refund amounts before completing the pending order. The focused recovery suites now contain **17 passing tests**.

| Guarantee | Test evidence | Type | Result |
| --- | --- | --- | --- |
| Historical paid rows match normalized email and payment ID without querying current product data | `purchase-recovery.test.js` | Service integration | PASS |
| Original and recovered browser tokens both remain valid; recovered tokens are scoped to the purchase and signing key | `purchase-recovery.test.js` | Service/crypto integration | PASS |
| Other owners/items/emails/payments reveal no purchase or download link | `purchase-recovery.test.js` | Service integration | PASS |
| Invalid fields fail before storage or gateway access | `purchase-recovery.test.js` | Service integration | PASS |
| Missed captured callbacks use the stored owner-scoped order; mismatched or uncaptured payments cannot complete it | `purchase-recovery.test.js` | Service integration with mocked gateway | PASS |
| Refunds do not release paid access; rate limits and unavailable gateways surface their errors | `purchase-recovery.test.js` | Service integration | PASS |
| Recovery is dispatched by POST and lookup queries retain owner filters without date cutoffs | `purchase-recovery.test.js` | API/repository integration | PASS |
| Recovery fields and errors are accessible; verified receipts are saved under the correct profile/item | `purchase-recovery-ui.test.cjs` | Rendered React UI/client integration | PASS |

## Final checks

- `node --test tests/*.test.js tests/*.test.cjs`: **315/315 pass**, zero skipped tests.
- `node --test --experimental-test-coverage --test-coverage-include=server/paymentService.js --test-coverage-include=server/paymentCrypto.js --test-coverage-include=shared/commerce.js --test-coverage-include=src/lib/publicActions.js --test-coverage-include=api/payments.js tests/purchase-recovery.test.js tests/purchase-recovery-ui.test.cjs tests/payments.test.js tests/payment-crypto.test.js tests/public-actions.test.js tests/api-flows.test.js`: **55 passing tests**, **99.09% lines, 90.16% branches, 100% functions** across those modules.
- Production build: `node --input-type=module -e "import { build } from 'vite'; import react from '@vitejs/plugin-react'; await build({configFile:false,plugins:[react()]});"`: **PASS**, 895 modules, 3.53 seconds. The direct build avoids the sandbox restriction on the standard configuration loader.
- No new package, environment variable or SQL migration is required. Existing Events/Commerce tables, owner isolation, checkout limits and `SESSION_SECRET` are reused.
- No separate TDD checkpoint commits were created; the user's earlier manual Git workflow was preserved.

## Unverified checks and limits

The browser fixture at `tests/browser/purchase-recovery.html` uses the real checkout UI with a local mock historical purchase. Browser navigation was attempted but automatic approval review returned **503 Service Unavailable** before execution. No browser interaction or visual verification is claimed. The passing tests use scripted databases, mocked gateway responses and rendered React markup.

This change has not been deployed or tested against a real historical purchase. Recovery requires a matching purchase row; it cannot import unrelated Razorpay payments or recover deleted database records. It does not provide email-only recovery or email delivery. The existing webhook remains responsible for updating refunds on previously confirmed purchases.
