# Master tags and feature access

Superadmin → Master creates tags, lists definitions and edits feature permissions. Customers retains tag assignment and account support.

Individual and Organisation are chosen during first-time profile setup. Workspace deployments use the existing workspace choice; deployments without workspaces save the account profile type. Users see one choice, and neither type is an assignable tag. University, Hospital, Contributors, Standard, Founders, Special, Hero, God, Fraud, Scammer, Narration Setter, Gov-Departments, Commercial/Enterprises, Community and Manufacturer are independent tags. The existing Private profile tag remains available. Master uses a flat list and opens creation/editing in a popup without parent or built-in labels.

The six permissions cover profile/public page editing, content/files/activity, AI knowledge/visitor Q&A, Store/orders/payments, enquiries and invites/suggestions. Each assigned tag must allow a feature. Untagged accounts follow Standard. Defaults retain existing Studio access; Superadmin can restrict any role. Account settings and platform support remain available. Labels never grant platform ownership. Profile type selection does not grant any feature permissions.

Every signed-in request reloads current role permissions from the database. UI navigation refreshes on window focus. Workspace membership roles and tag permissions must both allow an action. Website connections and source access policies require knowledge permission; team tools require community permission. The Studio assistant, combined analytics, webhooks and data exports require all six permissions because they access multiple areas. Workspace selection and account/support recovery remain accessible. Shared page writes separately enforce Store and activity permissions; content-only accounts use a limited activity API. Delivery assets require Store access.

For an existing database, run `supabase/master-rbac.sql` after `admin-experience.sql`, before releasing the application. It preserves assignments and privacy, and reruns preserve edited permissions. An existing custom tag with a newly reserved built-in name receives a `(custom)` suffix; its key, assigned accounts and access rules remain unchanged. For a fresh database, run the schema scripts in dependency order and finish with `supabase/master-rbac.sql`.

Validation: `npm test`, `npm run build`. Browser fixture: `npm run dev:web` then `/tests/browser/governance.html?role=owner&view=/superadmin/master`.
