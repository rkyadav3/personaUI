# Jobs, profile creation and contributor access

## Installation

Apply `supabase/jobs-profiles.sql` after the existing profile, enquiry, events and platform migrations, including `admin-experience.sql`, `master-rbac.sql`, `hosted-assets.sql`, `workspaces.sql`, `organization-profiles.sql` and `collaboration-webhooks.sql`. Then apply `supabase/staff-permissions.sql`. These migrations are required before deploying the updated API. They create jobs, résumé metadata and actor-bound file-upload records; add profile approval, scoped staff capabilities and protected delegated editing; and extend the existing public submission rate limiter for jobs.

The migration preserves edited permissions when rerun. Its initial Jobs grant applies only to tags that previously allowed all six Studio features. Restricted tags retain their restrictions. Profile Creator starts with no Studio permissions and `profiles.create` platform access. A custom tag already named Profile Creator is renamed with a unique custom suffix while preserving its key and assignments.

`WORKSPACES_ENABLED=true` enables existing team access and switching. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required for direct browser uploads. Résumés use the private `persona-assets` bucket with signed upload tokens and one-minute download links. The migration adds the DOC MIME type to that bucket's existing allowlist.

## Posting and applying

Individual and Organisation owners and workspace administrators with Jobs permission can use `/admin/jobs`. Postings include title, description, requirements, location, employment type, workplace type, optional compensation and closing date. Drafts stay hidden; published jobs appear at `/p/:slug/jobs`; closed or expired jobs stop accepting applications.

Applicants provide their name, email, optional phone, cover note and consent. They upload a PDF, DOC or DOCX résumé up to 5 MB or supply an HTTPS résumé link. The server verifies the uploaded object's size and MIME type before an atomic application write. Each upload can be submitted once, within one day. Job uploads and applications share an hourly per-profile/IP limit of 15 requests.

Applications arrive in Inbox → Enquiries with the job title. Administrators with Enquiries permission can prepare and refresh a private résumé download link. Existing applications and résumés remain in Inbox when a job is deleted. Draft, pending, private, suspended and unavailable profiles do not expose job listings or accept applications.

## Creating and approving profiles

Superadmin → Profiles replaces Customers. Full Superadmin can create an Individual or Organisation administrator account with a name, email, profile ID and initial password. These accounts start approved with a draft profile. Creation does not send an email; share the initial credentials through your existing onboarding process.

Master contains the internal Profile Creator tag, which starts with only `profiles.create`: it opens Profiles and allows creating new accounts and viewing accounts created by that actor. An actor can have at most 50 pending creations.

Superadmin can also grant `profiles.edit` and `master.manage` independently to internal Staff tags or directly to an account. Staff see and use only enabled tools. Profile editors can change ordinary accounts and assign tags that carry no platform privileges. Master staff can create/edit tags and Studio feature permissions. Platform identities, password resets, suspensions, deletions, profile approval and platform-access grants remain owner-only. Each request reloads staff permissions, and delegated profile updates recheck current grants and protected tags atomically in the database.

Accounts created by a Profile Creator remain pending until full Superadmin chooses Approve profile or Decline in Profiles. Pending and declined accounts cannot sign in or obtain valid sessions. The database also blocks publication until approval.

## Contributor access and profile switching

Contributors can add files and articles and update their own records. Server queries restrict reads and updates to their `created_by` identity. Contributors cannot read profile settings, team details, enquiries or shared private sources, or delete records. Upload registration consumes an expiring record bound to the actor who requested the signed upload before reading storage, preventing contributors from registering another member's private file path.

The account menu next to View live portfolio and Edit portfolio exposes a selector when the account has multiple profiles. Switching uses verified active memberships and reloads the selected profile. Contributors land on Add information and see only Content and Files tools.

## Verification

Run `node --test --test-concurrency=4 tests/*.test.js tests/*.test.cjs` and `npm run build`. Tests cover actor-bound upload registration, scoped capabilities, creator-only listings, approval publication checks, job closure, résumé replay, private downloads, migration label collisions and permission preservation on rerun. SQL tests include the actual tag and workspace migrations and the existing rate-limit schema.

Browser checks use mocked API and signed-storage responses to verify posting, file-upload requests, Inbox download errors/retry, creator-only navigation, pending creation/approval, mobile dialog fit and contributor switching. A deployed Supabase smoke test remains necessary after applying the migration.
