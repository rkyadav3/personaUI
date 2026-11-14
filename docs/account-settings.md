Account settings are available under Settings → Account for admins and SuperAdmins. User ID means the username in `/p/<user-id>`, rather than the internal account UUID. Content, purchases and tenant ownership continue using that UUID. Changing a user ID changes its public address; shared links should be updated.

The current password is required for either change. Failed attempts use the same database-backed throttle as sign-in. New passwords require at least eight characters and at most 72 UTF-8 bytes. Password changes and owner password resets invalidate all existing session cookies. A new login receives the current session version.

The first user ID edit is available immediately. Each successful change starts a 14-day cooldown. Database row locks and a trigger enforce this across browsers and all user editors. Submitting the current ID does not start or extend the cooldown.

Before deploying, run `supabase/account-settings.sql` after the existing security-hardening setup in the Supabase SQL editor. It also upgrades sign-in to include the current session version. Run `supabase/store-currency.sql` after the existing portfolio and profile migrations. These scripts are idempotent. Git deployment does not install SQL functions. Account and bulk currency changes are not activated until the database migrations are applied.

Store → Store currency sets the default used by new items and the admin assistant. Existing items retain their saved currency. The optional “Apply this currency to all existing items” action atomically updates this owner's products, offerings and page default. It preserves numeric prices, stock and previous purchase receipts; it does not perform exchange-rate conversion. Individual item edits remain available in Store. The page editor links to Store for currency changes so there is one place to manage pricing.

New writing templates start empty. Profile and activity editors use generic placeholders instead of example people, companies, products or achievements. The main directory uses neutral default copy. Existing owner-entered content is retained.
