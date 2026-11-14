# Public page customization and content navigation

Store (`/admin/store`) is the management destination for products, offerings and their categories. Its catalogue lists both kinds without merging records or purchase references. Activity (`/admin/activity`) owns projects, events/updates, talks, awards, recognition, certificates, testimonials and the optional public experience timeline. Profile remains under Settings; the timeline explicitly falls back to profile employment when empty. Old offering and update routes redirect to these destinations.

The public page editor owns presentation, headings, featured selections, navigation and footer text. Its contextual controls cover Home, Activity, Store, Chat, Contact and site style. Page overrides inherit site settings. Presets apply once and preserve selected content. Advanced controls are collapsed. Store and Activity creation forms are shared canonical editors rather than copies inside Settings.

`shared/customization.js` defines all new controls, safe defaults and validation. The assistant catalog uses that same registry. Every supported option can be read or proposed through the existing review/approve/apply flow. The assistant also manages the content records and existing theme, persona, profile and privacy options. Device uploads still require a selected file; the assistant can set safe supplied image URLs and adjust/remove portraits/backgrounds. Examples:

- “Use editorial style, hide Events on Home and use a two-column Store.”
- “Show certificates first in Activity and hide its dates.”
- “Use a dark Chat page, hide suggested questions and change its welcome message.”
- “Hide phone and budget on Contact and label the button Send request.”

Preview renders into a same-origin iframe with a 1320px desktop or 390px mobile viewport, using the loaded application stylesheets. Undo includes pending image uploads and removal flags. Drafts survive content/preview navigation within the current application session. Reloading or closing the browser warns about unsaved edits; explicit reload/discard controls reset drafts. Draft rebasing changes only locally edited fields, with conflicts retained for review.

`site.get` returns a version based on `site_settings.updated_at`. Saves compare the expected version and perform a conditional database write against that timestamp. Competing assistant reviews or editors cannot both overwrite the same settings snapshot. Content saves patch only their owned portfolio fields. Legacy product-ID migration updates featured references in the same write. Award and recognition selections use persisted record IDs so reordering cannot switch highlights. New checkout can be disabled; existing receipts and payment completion remain available.

Verified locally: **462 passing tests, 0 failing, 0 skipped**, and a successful production build. Run `node --test tests/*.test.js tests/*.test.cjs` and `node node_modules/vite/bin/vite.js build`. Customization tests cover every registry field in assistant plans, safe values, owned references, display behavior, stable identities, conditional writes, draft conflicts, combined Events limits and image Undo. SSR checks exercise public markup; offline lifecycle tests exercise editor state. These checks do not execute PostgreSQL or verify rendered browser layout.

Browser execution is unavailable because automatic approval review rejected the earlier Playwright check (`content-blocked`). No rendered desktop/mobile pass is claimed. Apply the separately added `supabase/platform-support.sql` after `registration.sql` to enable Support; this migration has not been run against a live database. Customization itself uses the existing page/portfolio JSON and timestamp columns.
