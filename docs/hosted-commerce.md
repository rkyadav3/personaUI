# Tenant boundaries and hosted Store delivery

## Requirements

- Supabase remains the storage/database provider for now; provider-specific file operations live in `server/assetStorage.js`.
- Public persona AI receives only the selected profile owner's currently published knowledge. Admin AI receives only its signed-in account's selected records. Models have no SQL, storage credentials, database client or arbitrary operation tool.
- Store has Items and Categories, one item form, hosted download files and service fulfillment. Categories organize items. Legacy product/offering identifiers remain internal for existing receipts and featured selections; `items.list/save/delete` is the common catalogue interface. This change does not consolidate both legacy database representations into one table.
- Cover media, purchased delivery files and knowledge documents remain separate. Uploading a book/video to Store does not index it or expose its contents to AI.
- New checkouts require a hosted delivery asset or service fulfillment. Existing purchased delivery URLs remain available on their original receipts.
- Orders are found by buyer email/phone. Contact recovery uses verified email/phone; internal purchase/payment IDs remain for gateway verification, refunds and audit. A saved receipt still works; old payment-ID recovery remains as a secondary compatibility option.
- Choose file accompanies applicable public media/link fields, including Store covers/files, project images, project attachments, talks, certificates, sources and update attachments. Portrait/background pickers remain available.
- Preserve paragraph breaks, use readable textareas, align related form controls and provide responsive action rows.
- Item drafts stay scoped to the signed-in account during navigation; failed saves retain the form. Uploads block Save and editor handoffs until completion. Offering edits compare per-item versions; product edits retain the existing portfolio version check.

## Deployment

1. Apply `supabase/hosted-assets.sql`, then `supabase/tenant-boundaries.sql`, after the existing migrations (including `knowledge-visibility.sql`, Events/commerce, Studio and governance).
2. Deploy the matching API and UI together. Upload registry and purchase asset columns are required. The migrations have been prepared locally, not applied to the live database.
3. In Supabase Auth, enable email OTP and configure the email template to show `{{ .Token }}`. Configure a production SMTP sender. Phone recovery requires the SMS provider and phone sign-in to be enabled; phone numbers must include country code. Recovery returns an unavailable message if the provider is unconfigured; it never trusts an unverified email/phone.
4. Keep private storage buckets private. This migration locks down `files`, `persona-assets` and `backgrounds`, including broad pre-existing browser storage policies. Deploy after taking a backup. Earlier `settings.sql` declares backgrounds public; do not rerun it after this migration.
5. Previous generated background/cover uploads are registered in place. API media URLs enforce profile visibility and issue 60-second signed URLs. New uploads use stable owner IDs, so changing a profile slug does not break its media. Older arbitrary object names or image URLs outside the configured Supabase origin may need re-uploading. Old externally hosted purchase assets cannot be imported without the owner providing their files.

## Guarantees and verification

The tenant client rejects unlisted tables/RPCs, stamps insert ownership and scopes updates/deletes/reads. Database triggers prevent cross-owner references and changing ownership. The relationship migration aborts on legacy cross-owner references instead of silently altering customer data.

Embedding updates use an owner-filtered, service-only RPC. Buyer OTP verification uses a fresh auth client; installing a buyer session never changes the shared server client credentials. Country-code phone validation keeps new checkout records compatible with verified phone recovery. Older phone-only records without a country code require the buyer's email or saved receipt.

Public retrieval independently re-reads owner chunks and published file/post sources before sending context to the model. Store assets are never eligible sources. Admin assistant operations use a fixed server-owned catalog, check identity against scope, and validate uploaded-file references against that owner's metadata. Changes still require the existing review/apply flow.

Delivery is snapshotted on the purchase. Every download checks owner, receipt proof, completed status and asset purpose, then signs a short-lived download. Refunds revoke new downloads. Verified contact recovery filters by both seller and verified contact. Browser memory holds its temporary contact verification token; it is not sent to the model.

Automated tests cover tenant crossing, current knowledge publication, private asset ownership/purpose, file size/type, completed/refunded receipt access, and verified contact lookup. Browser fixtures are isolated from production services. Live database policy application, OTP delivery and real gateway/storage transfers require the deployment configuration above.
