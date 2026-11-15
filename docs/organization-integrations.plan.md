# Organization and integration delivery

User-approved scope: one public Persona and one private Admin Assistant per individual or organization. Keep the existing green-and-white application and its core knowledge workflow. External websites authenticate through their backend with a secret API key.

## Stages

1. Workspace foundation: backfill existing accounts without changing URLs or legacy ownership, enforce workspace references, verify membership and status.
2. Organization experience: first-login type choice, grounded AI profile extraction and editable confirmation, organization labels and public knowledge, validity metadata.
3. Website integration: scoped credentials, server API, sessions, shared quotas, retries, usage accounting, snippet and serverless installation examples.
4. Super Admin operations: workspace tracking, evidence-based API/security health, audit history, settings, suspension and emergency controls.
5. Collaboration and events: shared assistants with team permissions, signed webhooks and durable delivery, retention/export and complete integration verification.

## Acceptance requirements

- Existing individual profiles, public URLs, content, purchases and privacy continue to work.
- Every private operation checks authenticated membership; public integrations receive only approved public knowledge.
- Revoked credentials and disabled workspaces/integrations reject new requests.
- Source labels are assigned by the server and identify the entry point/credential, not a proven browser origin.
- Budgets and rate limits work across concurrent serverless requests.
- Loading pages show skeletons; uploads/indexing show measured progress; forms show busy states and preserve unsaved input on errors.
- Health reports show measured evidence, time windows and Unknown for missing/stale checks.
- Commit and push each verified stage; preserve RED/GREEN evidence.
- Schema installation is independently verified and reported separately from Git deployment.

## Delivery state

Base: ca725d69689392711e8a03ea671cf4fcc6fa899e. Branch: codex/organization-integrations.
Stages 1–5 are implemented and verified locally. Stage 5 includes teams, signed durable webhooks, export/retention and workspace-bound requests, with 549 passing tests and a production build. The old loading spinner is restored. External Persona and maintenance routes share the existing chat function, keeping deployment at 12 functions for Hobby; Vercel confirmed the testing checkpoint deployment READY. Browser checks cover login/invitations, role restrictions, save retries, downloads and actual 390px mobile layout. The standalone untracked UI prototype was removed from the original checkout at the user's request.

Hosted migrations are user-managed through the SQL Editor, as explicitly requested. Deliver executable SQL and its run order; keep hosted installation status separate from local verification.

The user confirmed successful installation of the combined five-migration SQL. The testing branch now has WORKSPACES_ENABLED and webhook worker secrets configured; its hosted credential lookup and unauthorized-maintenance rejection are verified. A Settings activation regression has three focused tests: unavailable tools stay hidden and reject before data access, enabled individual owners can manage connections, and viewer restrictions remain enforced. The complete suite now has 552 passing tests. Production activation and authenticated hosted organization/individual, website and webhook flows remain unverified. See production-readiness.md.
