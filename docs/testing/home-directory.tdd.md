# Main home directory: TDD and verification evidence

## User journeys and product decisions

The user supplied a green-and-white main-home-page reference and requested its public profile, product and engagement features. The implementation includes a centered search, featured creator, ranked profile carousel and expandable Top Products panel, with responsive layouts.

- Visitors search published creators by name, expertise, industry or product title and open their public profiles.
- Visitors inspect product details, claim free products or use the existing Razorpay checkout for paid products.
- Visitors rate offerings from home dialogs and public profile shops. Owners and previews cannot rate their own products.
- Creator metrics use visible offerings and real engagement. The user explicitly selected real offering interactions for the reference's reliability-score slot.
- Product enquiries open published contact details or public chat when contact is disabled. Hidden content and private delivery links stay out of the public feed.

## RED and GREEN

Before implementation, the initial home suite recorded 13 tests and 13 failures. Additional search, aggregate and public-rating checks recorded 18 tests with 3 failures. The initial engagement suite recorded 7 tests and 7 failures. Final contact-fallback and malformed-tracking checks recorded 30 tests with 2 failures. These failures were resolved before final verification.

Behavioral coverage includes published-content filtering, portfolio product mapping, product-specific search, ranking and aggregate ratings, rating updates beyond the capped product feed, checkout actions, contact fallback, owner/preview restrictions and malformed tracking requests. Service tests use scripted databases and external-service mocks; UI tests assert rendered React markup.

The TDD skill requests local Git checkpoint commits. The sandbox could not create `.git/index.lock`, and the earlier approval escalation returned 503 before execution. No RED/GREEN checkpoint commits were created. This report preserves the observed results.

## Final verification

- `node --test tests/*.test.js tests/*.test.cjs`: **276/276 pass**, zero skipped tests.
- `node --test --experimental-test-coverage --test-coverage-include=server/home.js --test-coverage-include=server/track.js --test-coverage-include=api/track.js --test-coverage-include=src/lib/homeDirectory.js tests/home-directory.test.js tests/home-engagement.test.js`: **99.75% lines, 90.65% branches, 98.04% functions** across the focused home and engagement modules.
- Production build: `node --input-type=module -e "import { build } from 'vite'; import react from '@vitejs/plugin-react'; await build({configFile:false,plugins:[react()]});"`: **PASS**, 894 modules transformed in 8.88 seconds.
- The normal npm launcher references a missing user-level npm CLI. Vite's normal configuration loader was blocked by ancestor-directory access in this sandbox. The direct build applies the same build settings without changing repository configuration.
- Typecheck/lint: no TypeScript or lint scripts are configured in this JavaScript repository.

## Deployment and unverified checks

Browser navigation was blocked before execution when automatic approval review returned **503 Service Unavailable**. Browser interaction, visual QA and live end-to-end validation remain unverified; passing rendered-markup tests do not establish visual fidelity.

Home engagement uses the existing `supabase/home.sql`. The accompanying Profile Q&A changes require applying `supabase/profile-questions.sql` before deployment. No migration has been applied to a live database, and historical chat replies that were never stored cannot be recovered.
