# Vercel environment setup

Open the app's project in Vercel, then **Settings → Environment Variables**. Add each variable separately: put its name in **Key / Name** and its value in **Value**. Do not put `NAME=value`, quotes or comments into the name field. Vercel can also import a completed `.env.local` file.

Select the deployment environments that should use the values, save, and redeploy. Server variables take effect in the new deployment. The two `VITE_` variables are embedded into the browser build and need a new build as well.

## Razorpay

| Name | Value to enter |
| --- | --- |
| `RAZORPAY_KEY_ID` | Razorpay Dashboard → Settings / Account & Settings → API Keys → the key ID. Use test mode initially (`rzp_test_…`). |
| `RAZORPAY_KEY_SECRET` | The API secret generated with that key ID. Enter it directly into Vercel or the private `.env.local` file. |
| `RAZORPAY_WEBHOOK_SECRET` | A secret chosen for the webhook. A generated value is available in the private `.env.local` file. Use that same value in Razorpay's webhook settings. |
| `PAYMENT_ENCRYPTION_KEY` | 32 random bytes as 64 hex characters or base64. A generated value is available in the private `.env.local` file. If production already has this variable, retain the existing production value: older purchase snapshots depend on it. |

Keep Razorpay values server-side; their names must not start with `VITE_`. The `.env.local` file is ignored by Git. Fill its empty Razorpay key ID and API secret before importing it into Vercel. Do not replace an existing production encryption key with a newly generated local key.

In Razorpay, configure the webhook URL as `https://YOUR-DEPLOYED-DOMAIN/api/razorpay-webhook` and enable `payment.captured`, `payment.failed`, `order.paid` and `refund.processed`. Match test keys with the test webhook; configure live keys and the live webhook separately when going live.

## Other app variables

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Your Supabase project URL. |
| `SUPABASE_SERVICE_KEY` | The server's Supabase secret / service-role key. |
| `VITE_SUPABASE_URL` | The same Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable / anon key, intended for the browser. |
| `GEMINI_API_KEY` | A real Google AI Studio API key; replace the example text in the local file. |
| `SESSION_SECRET` | A stable random secret for login cookies. Preserve an existing production value. |
| `ADMIN_EMAILS` | The actual login emails that should have administrator access, comma-separated. Replace `you@example.com`. |
| `GEMINI_MODEL` | The model ID configured in `.env.example`, or another supported model enabled for your API key. |
| `REGISTRATION_MODE` | `invite`, `open` or `closed`. |
| `SITE_NAME` | The name displayed on the platform home page, such as `Persona`. |

Existing local Supabase and session values were retained when preparing `.env.local`; this does not verify their remote validity. Replace any example Gemini key or administrator email before importing the full file. Optional relevance and embedding variables are listed in `.env.example`.

## Admin payment settings

**Admin → Purchases → Payment settings** displays whether the shared server account is configured, whether it is in test mode, and whether the webhook secret is present. It lets each profile owner enable or disable paid checkout for their own profile.

It does not collect Razorpay API credentials or change the receiving merchant account. All paid sales use the app's shared Razorpay account, with each sale recorded against the selling profile. Free claims do not require Razorpay. The Purchases tab manages buyer records, payment status, private notes and fulfillment.

Apply `supabase/events-commerce.sql` as described in `docs/events-shop-setup.md`. After saving Vercel variables and redeploying, open Admin payment settings to confirm the server reports configured, then enable paid checkout for the profile.
