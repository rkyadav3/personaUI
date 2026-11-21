# Organization add-on production readiness

Production audit: suitable for internal testing. Local implementation, hosted activation, designated account access, real organization knowledge/chat and shared quotas are verified. Production activation and global maintenance remain unverified.

## Before production activation

1. The user confirmed successful execution of the supplied combined SQL in the existing Persona Supabase database. The block installs workspaces.sql, organization-profiles.sql, website-integrations.sql, workspace-operations.sql and collaboration-webhooks.sql in that order. Full authenticated hosted verification is still required.
2. WORKSPACES_ENABLED=true, WEBHOOK_ENCRYPTION_KEY (32 random bytes, base64) and a separate random CRON_SECRET are now configured for Preview branch codex/organization-integrations. Redeployment persona-40i1tvw5m-rkyadav3.vercel.app is READY. An invalid formatted API key reaches the hosted credentials lookup and returns the expected unavailable-key response; maintenance without authorization is denied. These checks do not execute retention or prove provider health. Configure production separately after testing and production approval.
3. Hosted checks verified the provided individual and Super Admin accounts, organization setup/review/publication, file storage and indexing, real platform/external answers, public exclusion of internal knowledge, shared private Assistant history, stale-tab rejection, retry replay and concurrent shared quota enforcement. Complete credential lifecycle and remaining team-role checks, and validate the installed website proxy/widget flow.
4. Webhooks are hidden and disabled at the user's request; implementation remains in the repository. WEBHOOKS_ENABLED defaults to false. The synthetic endpoint was disabled and the temporary receiver project removed. No live webhook completion or scheduler activation is required for this release. Validate authorized retention on test records with an appropriate backup before production scheduling; no global maintenance was executed against the shared hosted database.

## Evidence checked

- Current testing checkpoint: 559 passing Node tests, production build and 12 serverless functions. Default parallel test processes hit local memory exhaustion; the complete bounded run with --test-concurrency=2 passed. Previous npm audit reported zero vulnerabilities.
- Actual SQL installation/rerun under PostgreSQL/PGlite and service-role execution.
- Independent Standards, React/spec and JavaScript/security reviews; resolved findings have regression coverage.
- Local browser checks for onboarding, invitations, roles, save retries, exports, loading and mobile layout. Fixtures intercept requests; these are not hosted database/AI tests.
- Vercel testing checkpoint deploy READY with exactly 12 functions and branch-scoped activation. Protected Preview requests were checked through the signed-in Vercel CLI; app authentication remains separate.
- Disabled deployment regression reproduced an individual owner receiving an administrator error from Settings. Add-on links now stay hidden while disabled, direct routes explain availability, and backend calls reject before opening account data. Enabled individual owners retain access; viewer restrictions remain enforced.
- Webhooks are hidden by default and their route aliases redirect safely. Their API and worker are disabled. Existing persisted endpoints must be disabled during deactivation because retained database triggers do not read server environment flags; the synthetic test endpoint is disabled. The Current organization / Current profile selector is removed from the sidebar at the user's request.

## Rollback and recovery

Before activating the add-on, create a recoverable database backup through the project's normal backup process. Retention is destructive: validate it on test records and retain the required backup before scheduling it against production.

For an application rollback, disable WORKSPACES_ENABLED, stop the external scheduler, and restore the last known-good production deployment in Vercel. The migrations preserve legacy owner IDs and URLs and can remain installed; do not drop workspace tables as part of a quick rollback. If new organization/team data must be reversed, restore the database backup rather than attempting ad hoc deletes.

Existing encrypted webhook secrets require the original encryption key. Preserve it through rollback; recreating endpoints is required if it is lost. Emergency external access can be stopped through Super Admin workspace controls, integration disabling or key revocation.

Remaining verification covers the credential lifecycle, installed proxy/widget, remaining team-role scenarios and backup-aware retention. The synthetic organization account is preserved for the user's testing. Global maintenance and retention have not been run against the shared hosted database. A passing build alone is not a production approval.
