# Connect your Persona to a website

1. In Persona, open Settings → Website connections. Create a connection using your website URL.
2. Save the one-time key in your website backend environment as `PERSONA_API_KEY`. Set `PERSONA_API_URL` to `https://YOUR_PERSONA_HOST/api/persona` and `SITE_ORIGIN` to your website's exact HTTPS origin.
3. Copy `examples/persona-proxy.js` from this repository into your website's `api/persona-proxy.js`. It runs as a Vercel Node serverless function. A Next.js/Express application can use the same upstream request inside its server route.
4. Add the snippet from Website connections to your HTML. The snippet loads `/persona-widget.js`; it contains no secret. It sends questions to your own backend route.

The installed widget shows a conversation, accessible busy progress and retry messages. The server uses the same published knowledge, profile visibility, source audience and validity checks as Persona's own chat. Organization files remain public only when reviewed and published for public use.

## Server API

POST `/api/persona` with `Authorization: Bearer <secret>` and JSON:

```json
{"op":"chat","message":"What are your admissions requirements?","requestId":"unique-request-uuid"}
```

Successful response: `{reply, sources, source: "external_api", requestId}`.

Optional sessions: send `{"op":"session"}` with the same backend API credential. Store the returned `sessionId` in your visitor's server session and include it on chat calls. It expires after 24 hours and is bound to that connection. Sessions track requests; this version answers each question from current approved knowledge and does not send previous visitor messages to the model.

Each question should have a new request ID. On a network timeout, 409 pending response or failed response delivery, retry the same ID and message. It returns the stored result without another model call or quota charge. A changed message/session with the same ID returns 409. A completed failed generation requires a new ID for a new attempt. Never automatically retry a 401/403; fix credentials/access. Honor `Retry-After` on 429. The widget preserves the pending request ID when its network call fails.

## Authentication and traffic tracking

API keys contain random secret material and only a SHA-256 digest is stored in Persona. Each key allows only public Persona chat/session operations, belongs to one website connection and expires after 90 days. Rotate and revoke keys in Settings. Store the key in server environment secrets; never paste it into browser JavaScript, a URL, public repository or analytics.

The source label is assigned by the server: `/api/chat` is `own_platform`; authenticated `/api/persona` is `external_api`, tied to its key/connection. This identifies the authenticated entry point. HTTP Origin, Referer and a deployment ID cannot prove which site or human sent an arbitrary HTTP request. CORS is a browser policy, not authentication. The customer proxy's Origin check is a browser CSRF guard; enforce your site's own authenticated visitor session for private deployments. Public websites should enable bot protection and rate limits at their hosting edge.

Quota admission is atomic in PostgreSQL with a workspace lock. Platform and external traffic share monthly request and minute limits. An admitted request consumes one request allowance, including a model failure. Replaying an admitted request does not consume another allowance. Actual model token counts are recorded when the provider supplies them; unavailable token data stays null.

Disabling a workspace or integration, revoking a key, making a profile private/unpublished, or removing source publication/public access blocks new requests through current server checks. An already-admitted request can finish.

## Installation order

For an existing Persona database, install the add-on SQL in this order:
1. `supabase/workspaces.sql`
2. `supabase/organization-profiles.sql`
3. `supabase/website-integrations.sql`
4. `supabase/workspace-operations.sql`
5. `supabase/collaboration-webhooks.sql`

Keep `WORKSPACES_ENABLED=false` until the supplied migrations are installed. Set it to `true` in the Persona server environment and redeploy. It is a server feature flag, never a browser secret.

Local tests execute the actual SQL in PostgreSQL/PGlite. Hosted SQL installation is handled by the operator and is reported separately from Git/build verification.

## Team access

Settings → Team access creates email-bound invitation links that expire after seven days. An invited user signs in with that email and accepts the link. New users first need a platform invitation to create their login, then reopen the team link. The workspace owner cannot be removed or demoted here. Changing or removing a member revokes outstanding invitations for that email so an older link cannot undo the decision.

Owners and administrators manage the workspace, its integrations, exports and shared private Admin Assistant. Contributors maintain files, articles and indexing. Viewers browse files and knowledge without editing. Team invitations open the shared profile. Personal profile data remains separate. Public URLs refer to the selected workspace owner.

## Export and retention

Settings → Data export downloads Persona conversations, private Admin Assistant conversations, file metadata, or articles as JSON. Administrators only; API keys, signed asset links and webhook secrets are omitted. Export pages stay bound to one workspace; changing workspaces during export cancels it with a retry message. File metadata exports do not download original file binaries.

Super Admin sets each workspace's conversation retention from 7 to 365 days. Scheduled maintenance prunes up to 1,000 expired rows per conversation table per run, removes settled/expired Assistant review content while preserving active reviews, clears expired reply content while retaining current-month usage accounting, and removes expired sessions. Settled webhook events expire after 30 days; queued/leased events remain available for delivery. Audit history expires after 365 days. These schedules require the authorized maintenance worker to run; a Git deployment alone does not apply hosted SQL or prove scheduler execution.

Each browser tab pins private requests to its loaded workspace. If the account's workspace changes in another tab, stale requests are rejected before reading or writing; refresh to continue. Assistant recovery and export pages are independently bound to that workspace.

