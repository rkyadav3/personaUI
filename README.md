# Persona RAG: React + Supabase + Vercel

The Streamlit admin and the static chat page are now one React app (Vite) with Vercel serverless APIs.

```
 you ──► React admin (/admin) ──► /api/admin ──► Supabase  ◄── /api/chat ◄── visitor's browser
         upload, edit, topics,    (auth, files,    Postgres +     embeds the question,   (/p/:slug/chat:
         writing, index           index, invites)  pgvector +     searches, asks Gemini   the dotted ball)
                                                   file storage
```

| Was (Python / HTML) | Now |
|---|---|
| `admin/streamlit_app.py`, `admin/pages/*.py` | `src/pages/*.jsx` (Overview, File manager, Add files, Research topics, Writing, Templates, Knowledge index, Invites, Login) |
| `admin/lib/{auth,tenant,store,indexer,chunker,embed,extract,search}.py` | `server/*.js` (same logic, same chunk/hash rules) |
| `web/index.html` (the ball) | `src/components/portfolio/Chat.jsx` inside Portfolio |
| `web/api/chat.js` | `api/chat.js` (now per-user via `slug`) |
| `streamlit-quill` | `react-quill-new` |
| pypdf / python-docx | `unpdf` / `mammoth` |

## Routes
- `/`: the members' **home page** (see below). Anyone can browse; nobody can join without an invite.
- `/p/:slug`: a member's **Portfolio home page**, with their photo, Events, free and paid shop items, and contact options.
- `/p/:slug/chat`: that member's **persona Chat**, using the same Portfolio navigation and appearance.
- `/u/:slug`: redirects existing shared links to `/p/:slug/chat`.
- `/admin`: sign in / create account, then the admin pages. Invite links look like `/admin?invite=CODE`.
- `/admin/purchases`: that owner's purchases, free claims, buyer details, fulfillment and shared payment settings.
- `/admin/questions`: the owner's visitor questions, persona replies, sources and dates, with access to older pages of history.
- `/admin/portfolio`: the single Portfolio editor, with Portfolio content, Look & Store, and Persona settings. Old `/admin/page` and `/admin/settings` links redirect here.

## Setup
1. **Supabase:** SQL Editor → run `supabase/schema.sql`, then `multitenant.sql`, `registration.sql`, `settings.sql`, `home.sql`, `page.sql`, `portfolio.sql`, `engage.sql`, `events-commerce.sql`, `studio-assistant.sql`, and `profile-questions.sql`. If your project already has those tables, compare first and run the migrations it is missing.
2. **Env vars:** copy `.env.example` to `.env.local` (local) or add them in Vercel. `SESSION_SECRET` is new: any long random string.
3. **Run locally:** `npm install`, `npm i -g vercel`, then `npm run dev` (first run asks you to log in and link a Vercel project; put your variables in `.env.local`). `npm run dev:web` runs only the UI and proxies `/api` to a `vercel dev` on port 3000.
4. **Deploy:** import the repo in Vercel (framework: Vite). Root directory is the repo root. Add the env vars. Deploy.
5. **First use:** create an account (put your email in `ADMIN_EMAILS` to see Invites), add files, open Knowledge Base and press **Sync now**, then test retrieval and visit `/p/<your-slug>/chat`.

## How uploads work now
Files go from the browser straight to Supabase Storage using a one-time signed token (so Vercel's 4.5 MB body limit doesn't apply), then `/api/admin` extracts the text and creates the row. Zips are unzipped in the browser into folders. Storage paths are prefixed with the owner id.

## Notes
- **Sync** runs in ~40 s slices from the browser until nothing is waiting (Vercel Hobby caps a function at 60 s). Press **Stop after this batch** to pause; Sync resumes where it stopped.
- Accounts: bcrypt hashes, 5 wrong passwords lock an account for 10 minutes, sessions are signed httpOnly cookies.
- `VITE_SUPABASE_ANON_KEY` is public by design. RLS is on with no policies, so it can do nothing except upload with a token the server issued.
- Tuning the "I don't know" gate, free-tier limits and model names: see the original notes. `MIN_SIMILARITY`, `MIN_KEYWORD_RANK`, `GEMINI_MODEL`, `EMBED_MODEL` all work as before.
- Changing `EMBED_MODEL` requires **Rebuild everything**.

## AI registration (profiles, contributions, offerings)
New accounts land on **Profile** and write one free-text introduction instead of filling a form.

1. **Write:** any format, 20 to 6000 characters.
2. **AI extraction** (`server/profile.js`, Gemini, same `GEMINI_API_KEY`/`GEMINI_MODEL`): returns a structured draft: name, education, contact, experience, designation, expertise, purpose, and contributions (7 categories, each free / paid / mixed / unspecified).
3. **Checks in code, not just in the prompt:** every draft passes `normalizeDraft` (unknown categories and fields are dropped); email and phone are taken from the text by regex; a name or location the AI returns that isn't in your text is discarded; nothing is assumed paid.
4. **Review:** missing fields are listed (name and purpose are required, the rest optional); you can add details and re-run (what you already filled in is kept), edit anything, set what is public, then confirm. **Nothing is saved as a profile until you confirm**, and each field records whether it is still the AI's value or was changed by you (`field_sources`).
5. **Manage later:** `/admin/profile` has Details, Visibility, and Contributions & offerings (add, edit, activate/deactivate or delete individual offerings; category-specific fields are defined in `shared/profileSchema.js`).
6. **Public page:** `/p/<slug>` via `api/profile.js`. The server sends only published, visible, enabled and active items. Contact details are private unless you tick them.

Storage: `profiles`, `contributions`, `offerings` are separate tables. `profile_submissions` keeps every raw input and AI output (private) for corrections and audit, and limits extraction to 12 per hour per user.

Offering forms let you choose any of your saved contribution categories, including custom subtypes. Editing an offering can move it to another category; the server validates that category in your own account and keeps only its allowed detail fields.

## Profile Q&A and content organization

**Profile Q&A** in Manage portfolio (`/admin/questions`) shows visitors' questions with the exact persona replies, source names, dates and answered status. Knowledge Base's visitor log uses the same view. History is private to the signed-in owner and paginated in batches of 50. Run `supabase/profile-questions.sql` **before deploying this code**. Older questions remain visible, but their past replies cannot be recovered because they were never stored. A history write failure returns a retryable chat error instead of silently losing a successful interaction.

Research Topics group files and posts; Templates are reusable article bodies copied into new drafts. Neither is an offering category or a portfolio layout. See [functionality and implementation discussion](docs/profile-management.md) for current behavior and proposed next steps.

Cover images for books are a URL for now (no image upload yet).

## Portfolio studio: appearance and persona settings
Open **Projects** in the Studio sidebar, or `/admin/portfolio`. **Portfolio content** edits the photo, text, projects, products and menu. **Look & Store** controls backgrounds, fonts, accents, glass panels, section visibility and offering categories. **Persona settings** controls Chat greetings, suggested questions, microphone, sources, portrait placement, the sphere and background image. The editor previews the relevant Portfolio page and saves these settings together.

Background controls include zoom, horizontal and vertical focus, blur, brightness, dark overlay and pointer parallax. Choose **My background image** in Look to display the image across Portfolio pages. Sphere visibility, size and glow affect Chat.

- Run `supabase/settings.sql` after `registration.sql`. It adds `site_settings` and a **public** `backgrounds` bucket (images only, 3 MB max).
- The browser shrinks the picture to 2200 px, re-encodes it (removing hidden photo data such as GPS), then uploads it straight to storage with a one-time token. The server validates both image uploads, saves one settings row, and then removes replaced images. A cleanup failure reports a saved-settings warning.
- Portfolio reads its published appearance from `/api/profile?slug=...`. The background-only `/api/site` API remains available for existing integrations.
- The Studio overview uses a white sidebar, green accents, a personal greeting, command bar and four shortcuts. Its admin assistant reads records and drafts create, update and delete commands. Every mutation shows a saved review with before/after values and requires **Approve and apply**. See [admin assistant setup](docs/admin-assistant-setup.md).

## Overview admin assistant

The Overview assistant manages your own profile, Portfolio, Look & Store, Persona, projects, products, Events and forms, attendance responses, offerings, files, folders, topics, posts, templates, enquiries, purchase fulfillment and payment preferences. Super Admin accounts can also manage users and invitations. The public Portfolio Chat continues to answer visitors' questions from published knowledge.

Try “Change my title to Product Designer”, “Create a published event tomorrow at 5pm called Design Meetup”, “Make Creator Guide free”, or “Show who is coming to Design Meetup”. Read requests answer directly; edits remain proposals until you approve their review. Sending another command discards the pending proposal before preparing its replacement.

Reviews expire after 15 minutes. The server checks the owner, current permissions and whether data changed since the preview, then claims the saved review once. Repeated approval cannot execute it again. A batch runs in sequence and stops on failure, showing completed, failed and unapplied steps. It does not roll back earlier completed steps. Reloading recovers the saved review; an interrupted command checks its status instead of retrying writes.

Run `supabase/studio-assistant.sql` and keep the existing server `GEMINI_API_KEY`/`GEMINI_MODEL` configuration. Dates use the browser's timezone. Uploads and passwords use the existing editors, and commands cannot change financial payment amounts or status. Knowledge sync, embedding and index clearing are separate reviewed jobs; large embedding jobs continue through another review or Knowledge Base.

## Members' home page (`/`)
A private platform: set `REGISTRATION_MODE=invite` (now the default in `.env.example`) so an account needs a code from **Admin → Invites**. Visitors browse without an account.

- **Layout:** a green-and-white directory with a centered headline and search, a featured creator, a ranked profile carousel, and an expandable Top Products panel. It adapts to desktop, tablet and mobile screens.
- **Search and sorting:** search names, expertise, industries and product titles; sort creators by Top rated, Most viewed, In demand or Latest. Product-title searches also filter the products shown.
- **Creator cards:** published profiles use their saved portrait and show expertise and real offering metrics. Draft profiles and hidden sections are excluded through `buildPublic`. A card opens `/p/:slug`.
- **Products:** public portfolio products open a details dialog with existing free-claim or Razorpay checkout actions. Enquiries use the creator's published contact page, or public chat when contact is disabled. Private delivery links are excluded from the directory.
- **Portfolio:** the Chat navigation item and default **Chat with my AI** button open `/p/:slug/chat`. Published contact details and the optional contact form remain inside the same Portfolio.
- **Data:** `api/home.js` provides a cached directory read and `api/track.js` records engagement. Run `supabase/home.sql` once.

How the numbers work:
- **Most viewed:** an offering counts once a visitor has had it mostly on screen for a second. Once per browser session, and a member's own visits never count.
- **Top rated:** visitors rate offerings from home product dialogs and public profile shops; one vote per visitor per offering (stored as a salted hash, never an IP). Creator ratings aggregate visible offerings. Ratings with at least five votes rank ahead of preliminary ratings, with Bayesian ranking within each group. Owners and previews cannot submit ratings. Rating changes update home aggregates immediately.
- **In demand:** clicks on offerings measure interest. Confirmed Razorpay purchases and free claims are recorded separately in the seller's **Purchases** panel.
- **Interactions:** the featured creator shows actual offering interactions, following the product decision to use real engagement rather than introducing a reliability score. Hidden or unpublished content and malformed tracking requests are rejected.
- The abuse limits in `api/track.js` live in memory per warm serverless instance. For stronger protection, add Vercel's firewall rate limiting.


## Portfolio pages (`/p/<slug>` and its sub-pages)
Every public profile uses **Portfolio**, including profiles previously saved as Classic. The standalone persona and Classic page components have been removed; existing appearance settings are retained by the unified editor.

| URL | Shows | Appears when |
|---|---|---|
| `/p/<slug>` | Hero with circular photo, Events and attendance, featured projects, every visible free and paid shop item | always |
| `/p/<slug>/chat` | Persona answers, suggested questions, optional microphone and sources, sphere and profile card | always |
| `/p/<slug>/work` | every project (card grid, tech chips, award, links, pop-up details) | at least one project |
| `/p/<slug>/products` | your portfolio products **plus** visible offerings, with free claims and Razorpay checkout | at least one product or offering |
| `/p/<slug>/experience` | timeline + education | any experience or education |
| `/p/<slug>/talks` | talks / podcasts / interviews **plus** "Talk Shows" offerings | at least one talk |
| `/p/<slug>/about` | story, skills, published contact details, social links | any of those |
| `/p/<slug>/updates` | announcements, schedule, Events and response forms | at least one published item |

**Every profile has its own text for every field** (`site_settings.portfolio`, one JSON document per owner, edited in **Portfolio studio → Portfolio content** with a live preview).
**Nothing is shown unless it exists.** `src/lib/portfolioModel.js` decides which blocks and sub-pages exist; the menu lists only pages with content; the layout (`src/styles/portfolio.css`) uses auto-fit grids so a missing photo, stats row, domain list, project image or whole section re-flows instead of leaving a hole. A missing hero photo becomes a monogram, a broken image URL falls back to an icon tile, and a sub-page with no content redirects home.

Sensible defaults come from the real profile when a field is left empty: title line = designation, intro = purpose, "What I do" = expertise, numbers = years of experience / projects / products, experience = employers, About = purpose.

Safety: links and picture URLs go through `cleanUrl` / `cleanImg` in `shared/portfolio.js` (http/https, mailto, tel or a site path only; `javascript:` etc. become empty) on save **and** on read. Text is length-limited and rendered as text (never as HTML).

Setup: run `supabase/portfolio.sql` once (adds `site_settings.portfolio`). Picture fields (project, product) take a URL; the hero photo is uploaded as before.

## Updates, schedule and enquiries
Run `supabase/engage.sql` once (after `portfolio.sql`). It adds the `updates` and `enquiries` tables.

**Admin → Updates & Schedule** (`/admin/updates`): three tabs.
- *Upcoming updates*: news, launches, announcements. Optional "happens on" date; a future date shows as **Upcoming**. Can be pinned.
- *Schedule*: dated items with start (and optional end), place, link. Visitors see them soonest first, in their own time zone, with an **Add to calendar** link. Finished items move under "Past events".
- *Events*: dated events with Going / Not going visitor forms, phone settings and up to six questions. Published Events and attendance appear on the profile home page; full responses are available to the owner through the Responses button.
- Each post is **Published** (visible) or **Draft** (private). Links are checked (http/https/mailto/tel only).

**Public profile:** a "What's new" block on the home page, and a new `/p/<slug>/updates` page. Both appear only when something is published.

**Contact form** (`/p/<slug>/contact`, where a visitor can select the related offering):
1. About you: name, email, phone/WhatsApp, organisation, city and country
2. Your enquiry: kind of enquiry, related offering, subject, message
3. Timing and budget (only for bookings, meetings, speaking, collaboration): preferred date and time, online / in person, budget
4. Reply: preferred way to be reached, consent tick-box

**Admin → Enquiries** (`/admin/enquiries`): each submission is stored under the profile owner's id, so it shows in that account's inbox and nowhere else (same tenant isolation as the rest of the admin). New ones are counted in the sidebar. Open one to reply by email / WhatsApp / call, mark it Read / Replied / Archived, add a private note, delete it, or export the list to CSV. The **Form settings** tab turns the form on or off, sets its title, intro and thank-you text, and limits which kinds of enquiry are offered.

Protections on `/api/enquiry`: everything is re-validated on the server, a hidden honeypot field catches bots, 5 enquiries per visitor per hour (stored as a salted hash, never the IP), an identical resend within a day is not stored twice, and an offering can only be attached if it belongs to that member and is active.

Notes: there is no email notification yet (enquiries are read in the admin). Portfolio includes Events, checkout, announcements, schedule and the contact page.

## Shared Razorpay checkout

Run `supabase/events-commerce.sql` after `engage.sql`. Configure the shared app's Razorpay API keys, webhook secret, and 32-byte payment encryption key. Free claims and verified paid purchases return a confirmation and the item's private access/download link; each owner sees their buyers and fulfillment details at `/admin/purchases`.

See [Events and profile shop setup](docs/events-shop-setup.md) for configuration, webhook events, delivery links and test-mode verification.
