# Portfolio studio TDD evidence

Journeys were derived from the user's request and attached Overview reference image; no plan document was supplied. The patch starts from `da08b7767ed948ba3b9f084b289dcff3eba19564`, which already includes Events and shared Razorpay checkout.

## User journeys

- A visitor opens one Portfolio at `/p/:slug` and uses its Chat page without switching to another profile template.
- A profile owner edits Portfolio content, Look & Store, and Persona settings in one editor, previews the result, and saves the settings together.
- A visitor can still see published Events, respond to them, and claim free items or buy paid items.
- An owner opens a Studio overview with the reference's white sidebar, green waves, personal greeting, command bar and four shortcuts.

## Checkpoints

These checkpoints were created on the staging copy's active `main` branch for this task and remain reachable from HEAD. They do not indicate that the original Desktop checkout was modified.

| Commit | Stage | Recorded result |
|---|---|---|
| `1ba70d5` | RED: Portfolio Chat, unified settings, Studio overview | 12 failures, 1 pass |
| `b161313` | GREEN: initial implementation | 13 focused tests pass |
| `2c61412` | Refactor: delete competing pages and preserve redirects | 102 tests and production build pass |
| `2b7c3c9` | RED: cleanup warning, hidden experience statistic, glass radius | 3 failures, 22 passes |
| `30dc7ac` | GREEN: save warnings, visibility, radius | 25 focused tests pass |
| `236132c` | RED: network errors, response cancellation, custom Chat profile copy | 3 failures, 25 passes |
| `e38ed3f` | GREEN: safe retry errors, abort propagation, Chat copy | 28 focused tests pass |

The focused command was `node --test tests/persona-chat.test.js tests/portfolio-studio.test.js tests/studio-ui.test.cjs`. Final refactoring also separates the nested tab panels, allows expanded sidebar navigation to scroll, updates canonical links and documentation, and tests both returned and thrown image-cleanup failures.

## Behavioral guarantees

| Guarantee | Evidence | Test type | Result |
|---|---|---|---|
| Classic settings resolve to Portfolio while retaining accents, cropping, Chat and background settings | `portfolio-studio.test.js` | Unit | PASS |
| Chat always has an internal route and default AI buttons use it | `portfolio-studio.test.js`, `studio-ui.test.cjs` | Unit / rendered markup | PASS |
| Shop, expertise, education and experience switches hide the corresponding blocks; hidden experience does not generate a statistic | `portfolio-studio.test.js` | Unit | PASS |
| A single save persists page, Portfolio and background settings | `portfolio-studio.test.js` | Integration with scripted DB | PASS |
| Both images are ownership-checked and verified before writing; failed writes preserve existing images; retained shared images are not deleted | `portfolio-studio.test.js` | Integration with scripted DB/storage | PASS |
| Cleanup errors report that settings were saved without exposing storage details | `portfolio-studio.test.js` | Integration with scripted DB/storage | PASS |
| Chat sends the owner slug and bounded question; limits, invalid replies, network errors and cancellations are handled | `persona-chat.test.js` | Unit with mocked fetch | PASS |
| Chat uses its custom copy, honors disabled controls in preview, and renders accessible message controls | `studio-ui.test.cjs` | Rendered markup | PASS |
| Look, Store and Persona controls exist in the consolidated editor; glass uses the selected radius | `studio-ui.test.cjs` | Rendered markup | PASS |
| Overview greeting, command form and four shortcuts render; commands open known local tools | `studio-ui.test.cjs`, `portfolio-studio.test.js` | Unit / rendered markup | PASS |
| Existing Event forms, every shop item, receipts and admin purchase details remain available after Classic removal | `profile-ui.test.cjs` and the existing Events/payment suites | Rendered markup / integration | PASS |

## Final verification

- Full suite with coverage: **117 tests, 117 passed, 0 failed, 0 skipped**.
- The declared `test:coverage` Node command in `package.json` was run directly. `npm run test:coverage` could not start because the machine's global npm launcher points to a missing `npm-cli.js`; this was a runner failure, not a test failure.
- Coverage: **96.12% lines, 87.29% branches, 85.00% functions** across the explicitly included server/API/shared/helper files. All previous coverage targets are retained; this task adds `server/site.js`, `shared/pageSettings.js`, `shared/studio.js`, `src/lib/personaChat.js` and `src/lib/portfolioModel.js`.
- Production build: `node ../portfolio-studio-preview.mjs --build` completed with **885 modules transformed**. The local runner uses the installed Vite/React pipeline with environment loading disabled and fixture APIs, without credentials or database/payment calls.
- The project has no lint or TypeScript check script. JSX compilation is covered by the production build.

## Known verification limits

Browser navigation to the isolated preview at `http://127.0.0.1:5174/admin` was not executed: automatic approval review returned HTTP 503 because its reviewer model service was unavailable. No interactive browser, mobile layout, microphone, real Gemini, Supabase or Razorpay validation is claimed for this task. Rendered-markup tests confirm content and attributes, not visual fidelity or browser interactions. Existing React SSR `useLayoutEffect` warnings are recorded separately from test results.

Coverage does not include interactive React component behavior. Uncovered lines in `server/site.js` primarily belong to the retained legacy background API and signed-upload calls. Real uploads, settings persistence and Chat should be checked against the configured app after application.

No database migration is added by this refactor. Existing Portfolio, Events and Commerce migrations and configuration remain necessary. The Overview command bar opens existing tools; it does not automatically create or edit content with AI.

The patch preserves this report and its RED/GREEN checkpoint index if staging commits are not transferred to the original repository.
