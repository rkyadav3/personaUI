# Persona RAG: React + Supabase + Vercel

The Streamlit admin and the static chat page are now one React app (Vite) with two Vercel serverless functions.

```
 you ──► React admin (/admin) ──► /api/admin ──► Supabase  ◄── /api/chat ◄── visitor's browser
         upload, edit, topics,    (auth, files,    Postgres +     embeds the question,   (/ or /u/:slug:
         writing, index           index, invites)  pgvector +     searches, asks Gemini   the dotted ball)
                                                   file storage
```

| Was (Python / HTML) | Now |
|---|---|
| `admin/streamlit_app.py`, `admin/pages/*.py` | `src/pages/*.jsx` (Overview, File manager, Add files, Research topics, Writing, Templates, Knowledge index, Invites, Login) |
| `admin/lib/{auth,tenant,store,indexer,chunker,embed,extract,search}.py` | `server/*.js` (same logic, same chunk/hash rules) |
| `web/index.html` (the ball) | `src/pages/Ball.jsx` |
| `web/api/chat.js` | `api/chat.js` (now per-user via `slug`) |
| `streamlit-quill` | `react-quill-new` |
| pypdf / python-docx | `unpdf` / `mammoth` |

## Routes
- `/` and `/u/:slug`: the public ball. `/` answers for `DEFAULT_SLUG`; `/u/:slug` for that user.
- `/admin`: sign in / create account, then the admin pages. Invite links look like `/admin?invite=CODE`.

## Setup
1. **Supabase:** SQL Editor → run `supabase/schema.sql`, then `supabase/multitenant.sql` (adds users, invite codes, `owner_id`, and owner-scoped search). If your project already has those tables, compare first.
2. **Env vars:** copy `.env.example` to `.env.local` (local) or add them in Vercel. `SESSION_SECRET` is new: any long random string.
3. **Run locally:** `npm install`, `npm i -g vercel`, then `npm run dev` (first run asks you to log in and link a Vercel project; put your variables in `.env.local`). `npm run dev:web` runs only the UI and proxies `/api` to a `vercel dev` on port 3000.
4. **Deploy:** import the repo in Vercel (framework: Vite). Root directory is the repo root. Add the env vars. Deploy.
5. **First use:** create an account (put your email in `ADMIN_EMAILS` to see Invites), add files, open Knowledge index and press **Sync now**, then test retrieval and visit `/u/<your-slug>`.

## How uploads work now
Files go from the browser straight to Supabase Storage using a one-time signed token (so Vercel's 4.5 MB body limit doesn't apply), then `/api/admin` extracts the text and creates the row. Zips are unzipped in the browser into folders. Storage paths are prefixed with the owner id.

## Notes
- **Sync** runs in ~40 s slices from the browser until nothing is waiting (Vercel Hobby caps a function at 60 s). Press **Stop after this batch** to pause; Sync resumes where it stopped.
- Accounts: bcrypt hashes, 5 wrong passwords lock an account for 10 minutes, sessions are signed httpOnly cookies.
- `VITE_SUPABASE_ANON_KEY` is public by design. RLS is on with no policies, so it can do nothing except upload with a token the server issued.
- Tuning the "I don't know" gate, free-tier limits and model names: see the original notes. `MIN_SIMILARITY`, `MIN_KEYWORD_RANK`, `GEMINI_MODEL`, `EMBED_MODEL` all work as before.
- Changing `EMBED_MODEL` requires **Rebuild everything**.
