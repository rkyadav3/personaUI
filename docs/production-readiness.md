# Organization add-on production readiness

Production audit: 69/100, suitable for internal testing. Local implementation and the Vercel testing deployment are verified; hosted activation and end-to-end customer flows are not yet verified.

## Before production activation

1. In the existing Persona Supabase database, install workspaces.sql, organization-profiles.sql, website-integrations.sql, workspace-operations.sql and collaboration-webhooks.sql in that order. The supplied single-transaction combined block was verified locally; hosted installation is user-managed and unconfirmed.
2. Set WORKSPACES_ENABLED=true only after installation succeeds. Configure WEBHOOK_ENCRYPTION_KEY (32 random bytes, base64) and CRON_SECRET (separate random secret, at least 32 characters) in Vercel server environments, then redeploy. Preview environment inspection found none of these three variables. Existing Supabase, Gemini and session variable names are present; presence does not prove provider health.
3. Verify a hosted organization and existing individual: onboarding, published/internal knowledge, real chat, revoked key rejection, shared quota enforcement, teammate roles and workspace switching. Connect a test website through its backend secret and test one real chat request and replay.
4. Verify a real signed webhook receiver and authorized maintenance run, including retries and retention on test records. Hobby's built-in cron runs daily on production only. Configure an external minute scheduler for prompt deliveries; validate its failures and durable event-ID deduplication.

## Evidence checked

- Complete Node suite: 549 passing tests; production build; npm audit with zero vulnerabilities.
- Actual SQL installation/rerun under PostgreSQL/PGlite and service-role execution.
- Independent Standards, React/spec and JavaScript/security reviews; resolved findings have regression coverage.
- Local browser checks for onboarding, invitations, roles, save retries, exports, loading and mobile layout. Fixtures intercept requests; these are not hosted database/AI tests.
- Vercel testing checkpoint deploy READY with exactly 12 functions. Hosted Persona/maintenance routing reaches the expected handlers; activation is explicitly disabled/unconfigured.

## Rollback and recovery

Before activating the add-on, create a recoverable database backup through the project's normal backup process. Retention is destructive: validate it on test records and retain the required backup before scheduling it against production.

For an application rollback, disable WORKSPACES_ENABLED, stop the external scheduler, and restore the last known-good production deployment in Vercel. The migrations preserve legacy owner IDs and URLs and can remain installed; do not drop workspace tables as part of a quick rollback. If new organization/team data must be reversed, restore the database backup rather than attempting ad hoc deletes.

Existing encrypted webhook secrets require the original encryption key. Preserve it through rollback; recreating endpoints is required if it is lost. Emergency external access can be stopped through Super Admin workspace controls, integration disabling or key revocation.

The next required action is the user-managed SQL installation, followed by server configuration and hosted flow verification. A passing build alone is not a production approval.
