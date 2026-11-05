# Admin workflow refresh

The Admin UI now groups pages by the job the owner is doing. Existing routes and detail links still work.

| Sidebar | Pages inside |
| --- | --- |
| Overview | Admin assistant and workspace activity |
| Public profile | Page editor; profile and offerings |
| Content | Articles; templates; research topics |
| Library | Files and notes; AI knowledge |
| Activity | Events and updates; purchases; enquiries; visitor Q&A |
| Administration (admins only) | People; invite links |

“Projects” has become “Public profile.” Project entries remain part of the page editor. The category navigation selects the correct page for old links such as `/admin/writing?tab=templates`, article/topic detail URLs, and `/admin/files?folder=1&file=2`.

Local tabs in Profile, Purchases, Enquiries, AI knowledge and Events/Updates now use the URL so refresh and Back/Forward restore the selected section. The assistant's existing `/admin/purchases?tab=settings` link opens Payment settings, as does `tab=payments`. Profile `tab=contrib` and `tab=visibility` links open offerings and privacy respectively. Updates use `kind=update|schedule|event`. Unrelated query parameters are preserved.

## Approval workflow

Every newly prepared or recovered pending assistant review opens a native dialog titled **Proposed changes**. It shows a short summary of additions, updates and deletions, readable change titles, and the existing before/after details and deletion warnings.

Closing the dialog keeps the review pending. **Review proposed changes** reopens it. Only **Approve and apply** sends approval; **Discard** cancels the draft. Read-only answers do not open the dialog. Expired and busy reviews cannot be applied. Applying/discarding blocks dismissal; Escape and the close button work when idle. The dialog uses native focus containment and restores focus when it closes.

The server review, expiry, ownership and explicit-approval checks are unchanged. Failed or uncertain results remain visible and use the existing status-recovery workflow.

## Content and Library

Templates provide reusable article outlines through a visual editor, with optional HTML editing. Creating an article from a template produces a private draft. Topics organize related files and articles; topic labels alone do not provide AI knowledge. Published, indexed source content is what the persona can search.

Files support type/status filters, name/date/size sorting, folder breadcrumbs, clearer empty states and a responsive table. Search uses the existing search endpoint, which matches names and contents across the library (up to 100 results).

Uploads support drag-and-drop, multiple selections, file sizes, removal from the queue, destination/topic selection and explicit **Publish to AI** or **Private draft** availability. ZIP expansion and signed uploads keep their existing implementation. The file dialog loads visibly, reports errors, and supports editing details/text, moving, downloading, deleting and publishing/private drafts for both documents and notes. A save followed by failed indexing reports that the file/article was saved and indexing needs attention.

Shared Admin styling provides sans-serif headings, consistent controls/cards, SVG icons and local navigation. Route/auth/data loading states use a centered, labelled SVG animation; reduced-motion settings stop the animation. Public profile preview headings keep their public typography.

A failed public-page preview no longer tells an existing owner to create a profile or hides their editor. It shows an error and **Retry preview** while leaving editing available. A genuinely missing profile links to setup. File downloads open a window synchronously during the click, remove its opener, then fetch the signed URL. Blocked windows and request failures are visible; failures close the blank window.

## Validation

- Tests were added before implementation: the initial six workflow tests failed for missing category navigation, dialog, loader and file filtering/list behavior.
- Sixteen new tests cover route grouping, category navigation, SVG loading/error rendering, approval summary, busy/expired approval controls, file filtering/sorting, empty states, upload availability choices, tab deep links, preview error/missing/loading states and download-window behavior.
- The additional eight tab/preview/download tests failed before the corresponding fixes were implemented.
- Full suite: **331 passed, 0 failed**. This includes the existing chat-history, newest-first conversation and purchase-recovery tests.
- Production Vite build passed; `git diff --check` passed.
- The browser fixture was bundle-checked. Live browser verification did not execute: automatic approval review returned HTTP 503 before Playwright navigation ran. Focus, visual layout and responsive interactions still need browser verification.

## Browser checks

Run `npm run dev:web` and open `/tests/browser/admin-workflow.html`. It renders the actual app with in-memory records and intercepts all fetches. Unsupported operations fail visibly; it sends no requests to real services. File uploads to storage and external downloads are intentionally unsupported by this fixture.

1. At desktop and 390px widths, check sidebar/menu, category tabs and local tool navigation. Open Content → Articles/Templates/Research topics and Activity → Visitor Q&A.
2. In Overview, submit a create/update request. Confirm the popup contains a summary and before/after details. Close it with Escape, reopen it and discard. Submit another request and approve. Verify focus returns and a result is shown. A message containing “help” returns a read-only answer without a review popup.
3. Browse Library. Filter by file type/status, sort, clear filters, create/open a folder, open/manage a file and move it.
4. Select files in Upload, remove one, and change between private/published availability. In Write a note, create private and published notes and inspect the resulting status.
5. Create and edit a template using the visual editor, then start an article from it. Save a draft, publish it, and assign a topic.
6. Set `window.fixtureIndexError = true` in browser developer tools, then save a file/article. Confirm the save succeeds with an indexing warning. Reset the flag after the check.
7. Check native dialog focus containment, Escape, focus restoration and scrolling. Enable reduced motion and check the loader remains visible without rotating.
8. Open the fixture with `?route=%2Fadmin%2Fpurchases%3Ftab%3Dsettings` and verify Payment settings opens directly. Test Profile's `tab=contrib` and `tab=visibility`, Enquiries' `tab=form`, Knowledge's `tab=test`, and Updates' `kind=event`. Switch local tabs and use Back/Forward.
9. Open the fixture with `?route=%2Fadmin%2Fportfolio&previewError=1`. Verify the editor remains available alongside a preview error. Set `window.fixturePreviewError = false`, click **Retry preview**, and verify the preview loads.

The UI refresh is packaged with the earlier purchase-recovery fix for the user-requested Git push. No new environment variables or database migration are required. Browser verification remains blocked as described above.
