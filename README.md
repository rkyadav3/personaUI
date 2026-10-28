# Persona Portfolio

Express + EJS + SQLite, organised as MVC.

```
config/       db schema, upload settings
models/       Folder, File, Topic, Post, Template (SQL only)
controllers/  request handling
routes/       admin, api, public
services/     retrieval (BM25 over your data), llm (Ollama optional), extractor, voice (empty)
views/        admin/*, public/*, partials/
public/       css, js, persona/ (3D assets, empty)
storage/      uploads + sqlite db (git-ignored)
```

## Run
```
cp .env.example .env     # set ADMIN_PASSWORD
npm install
npm start
```
Site: http://localhost:3000 — Admin: http://localhost:3000/admin

## Demo data
`npm run seed` adds ~12 topics, ~500 files and ~24 posts (`npm run seed -- --reset` wipes first).

## How the persona stays on your data
`services/retrieval.js` indexes only published files and published posts. `services/llm.js`
answers from the top passages. Set `LLM_URL` (Ollama) to have a small local model phrase the
answer; without it the answer is extracted directly from your text. Drafts are never indexed.

## Not built yet (files exist, empty)
3D model (`public/js/persona3d.js`, `public/persona/model.glb`), voice (`services/voice.js`),
public research/post pages, PDF/DOCX text extraction.
