# Events and profile shop setup

The home page for these features is each owner's `/p/<slug>` profile. The `/` route continues to list members.

## Database

After the existing profile, page, portfolio and engagement migrations, run `supabase/events-commerce.sql` in the Supabase SQL editor. It adds Event forms, owner-scoped responses, private offering delivery links, purchases, payment preferences and atomic payment/refund operations. The script uses one transaction and can be run again.

Only the server service role can access the new tables and functions. Public visitors use the form and payment APIs; owners use their authenticated, scoped admin panel.

## Shared Razorpay account

Add these **server-side** environment variables in Vercel or `.env.local` for `vercel dev`:

| Variable | Value |
| --- | --- |
| `RAZORPAY_KEY_ID` | The shared app account's Razorpay key ID. Start with `rzp_test_…`. |
| `RAZORPAY_KEY_SECRET` | The matching API secret. |
| `RAZORPAY_WEBHOOK_SECRET` | The secret you choose for the shared webhook. |
| `PAYMENT_ENCRYPTION_KEY` | 32 random bytes, encoded as base64 or 64 hex characters. |

Never prefix these variables with `VITE_` or commit their real values. Retain the encryption key: existing pending purchases need it to read their encrypted account snapshots. A server-side key rotation also requires retaining access to the old encryption key or migrating snapshots; replacing the key alone prevents older orders from being verified.

In Razorpay, create one webhook pointing to `https://YOUR-DOMAIN/api/razorpay-webhook`. Select `payment.captured`, `payment.failed`, `order.paid` and `refund.processed`. Set its secret to `RAZORPAY_WEBHOOK_SECRET`. Configure the test and live environments separately. INR works with the default shop settings; other offered currencies need support enabled on the shared Razorpay account.

Every owner's **Purchases → Payment settings** shows whether the server is configured and lets that owner enable or disable paid checkout. There are no per-profile merchant credentials. Funds go to the shared app account; the purchase and revenue records are grouped by the profile owner. This change does not transfer payouts to separate owner accounts.

## Publish shop items

- Under **Profile & Offerings**, edit each visible offering and choose Free or Paid. For paid items, set a positive price and currency.
- Under **Portfolio studio → Portfolio content → Products**, add portfolio products with the same pricing options.
- Set an **Access / download link after checkout** on each item. This link is private until a free claim or verified payment completes. The public details link is for information that visitors can see before purchasing.
- Activate the offering and keep its category visible. Categories explicitly hidden in Look & Store remain hidden.
- All visible products and offerings appear on the Portfolio home page and Shop page. Shop visibility and offering categories are managed in **Look & Store**.

Free items ask for buyer details, record a free claim, and display the confirmation and access link without Razorpay. Paid items create the server-priced Razorpay order and release the link only after signature, order, amount, currency and capture verification. Receipt recovery and the webhook can finish a captured payment when a browser callback is missed.

The confirmation is shown in the browser. There is no email service in this change. The buyer should bookmark the access link; their private receipt is also retained in that browser when storage is available. Access links themselves should point to the owner's desired delivery service. A shared static file link can be forwarded; this feature controls its release, rather than issuing individually authenticated file downloads.

The owner's **Purchases** panel shows buyers, price, currency, status, Razorpay references, refunded amounts, fulfillment and private notes. It includes both free claims and paid purchases. Refunds are initiated in the shared Razorpay dashboard; signed refund notifications update the app. A full refund stops the app from returning the access link again, but cannot revoke a link already copied or a file already downloaded.

## Publish Events

1. Open **Updates & Schedule → Events → Add Event**.
2. Set the title, details, start/end time, location and an optional public information link.
3. Configure the response form, public attendee-name display, required phone and up to six questions.
4. Publish. Visitors can choose Going or Not going on the profile home page or Updates page.
5. Open **Responses** beside the Event in the admin panel to read names, contact details, notes and answers.

Counts include all responses. Public names appear only when the organizer enables them and the visitor consents. Contacts and answers are private to the owner. The same email's response can be updated using the private edit token retained in the submitting browser. Responses close at the end time, or three hours after the start when no end is supplied. Deleting an Event also deletes its responses.

## Verification

Use Node 24 for the test runner. Run `npm test`, `npm run test:coverage`, and `npm run build`. Coverage targets the newly added event/commerce services, repositories, HTTP handlers and browser helpers; it does not claim whole-application coverage.

Before taking live payments, complete a Razorpay **test-mode** purchase on the deployed app, verify its confirmation and admin record, and test a refund webhook. The automated tests use isolated database queries and gateway responses. The migration and actual Razorpay account must be checked against your configured environment.
