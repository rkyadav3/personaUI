# Organization add-on production readiness

Production audit: suitable for internal testing. Local implementation and hosted testing activation are verified; authenticated hosted customer flows and production activation are not yet verified.

## Before production activation

1. The user confirmed successful execution of the supplied combined SQL in the existing Persona Supabase database. The block installs workspaces.sql, organization-profiles.sql, website-integrations.sql, workspace-operations.sql and collaboration-webhooks.sql in that order. Full authenticated hosted verification is still required.
2. WORKSPACES_ENABLED=true, WEBHOOK_ENCRYPTION_KEY (32 random bytes, base64) and a separate random CRON_SECRET are now configured for Preview branch codex/organization-integrations. Redeployment persona-40i1tvw5m-rkyadav3.vercel.app is READY. An invalid formatted API key reaches the hosted credentials lookup and returns the expected unavailable-key response; maintenance without authorization is denied. These checks do not execute retention or prove provider health. Configure production separately after testing and production approval.
3. Verify a hosted organization and existing individual: onboarding, published/internal knowledge, real chat, revoked key rejection, shared quota enforcement, teammate roles and workspace switching. Connect a test website through its backend secret and test one real chat request and replay.
4. Verify a real signed webhook receiver and authorized maintenance run, including retries and retention on test records. Hobby's built-in cron runs daily on production only. Configure an external minute scheduler for prompt deliveries; validate its failures and durable event-ID deduplication.

## Evidence checked

- Complete Node suite: 552 passing tests; production build; previous npm audit with zero vulnerabilities.
- Actual SQL installation/rerun under PostgreSQL/PGlite and service-role execution.
- Independent Standards, React/spec and JavaScript/security reviews; resolved findings have regression coverage.
- Local browser checks for onboarding, invitations, roles, save retries, exports, loading and mobile layout. Fixtures intercept requests; these are not hosted database/AI tests.
- Vercel testing checkpoint deploy READY with exactly 12 functions and branch-scoped activation. Protected Preview requests were checked through the signed-in Vercel CLI; app authentication remains separate.
- Disabled deployment regression reproduced an individual owner receiving an administrator error from Settings. Add-on links now stay hidden while disabled, direct routes explain availability, and backend calls reject before opening account data. Enabled individual owners retain access; viewer restrictions remain enforced.

## Rollback and recovery

Before activating the add-on, create a recoverable database backup through the project's normal backup process. Retention is destructive: validate it on test records and retain the required backup before scheduling it against production.

For an application rollback, disable WORKSPACES_ENABLED, stop the external scheduler, and restore the last known-good production deployment in Vercel. The migrations preserve legacy owner IDs and URLs and can remain installed; do not drop workspace tables as part of a quick rollback. If new organization/team data must be reversed, restore the database backup rather than attempting ad hoc deletes.

Existing encrypted webhook secrets require the original encryption key. Preserve it through rollback; recreating endpoints is required if it is lost. Emergency external access can be stopped through Super Admin workspace controls, integration disabling or key revocation.

The next required action is authenticated hosted flow verification using designated test accounts and a controlled webhook receiver. Global maintenance and retention have not been run against the shared hosted database. A passing build alone is not a production approval.
