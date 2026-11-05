# Profile management: behavior and discussion

## Offering categories

Categories are owner-specific `contributions` rows. Each `offerings.contribution_id` references one category; deleting that category deletes its offerings. An offering form now selects from all of the owner's saved categories, preselects its starting or saved category, and updates the category-specific fields when the selection changes. Saving uses the selected category ID. The existing server checks that category through the tenant-scoped client and discards detail keys that do not belong to it. Add a contribution category before creating an offering in it.

## Research Topics

`/admin/topics` supports creating, renaming, describing and deleting topics. Topic detail lists associated files and posts and can create a draft post in that topic. Files and posts each have one optional `topic_id`; deleting a topic removes that association and keeps the content. Topics and their counts belong to the signed-in owner.

The public persona retrieves indexed chunks from published files and posts. Topic names and descriptions are organizational metadata; they are not themselves indexed or a retrieval filter. Answers cite source names, not topic names. The current Topics guide suggests otherwise and should be revised when we agree on the intended role.

Recommended direction: keep Topics as an internal knowledge organization feature, add an explicit template choice when starting a post from a topic, and use unanswered visitor Q&A to identify missing content. Currently the topic's New Post button silently uses the first saved template. If visitors should browse topics or restrict answers to one topic, that requires a public topic model, visibility rules and changes to retrieval; confirm that product behavior before implementation. Multiple topics per file or post would also require a new relation rather than the current single foreign key.

## Templates

`/admin/templates` opens the Article Templates tab in Writing & Content Studio. Owners can create, edit and delete an HTML article body, or copy it into a new draft. `posts.template_id` records the originating template. Updating a template does not rewrite existing posts, and deleting it keeps those posts. Templates are private authoring aids; they are not AI prompts, standalone knowledge sources, offering categories or portfolio design templates.

Recommended direction: retain reusable article templates, provide a visual editor and preview alongside HTML source, offer owner-specific starter templates for new accounts, and make template selection explicit in both Writing and Topic detail. Decide whether the intended Templates section is about article structure or portfolio design before expanding it. Portfolio appearance already has a separate editor at `/admin/portfolio`.

## Profile Q&A

`/admin/questions`, linked as Profile Q&A in Manage portfolio, lists visitor questions newest first with actual persona replies, source names, dates and answered status. Knowledge Base's Visitor Query Logs tab uses the same view. It paginates at 50 rows with a stable date/ID sort, so owners can reach older questions. Authentication and the existing tenant client ensure owners read only their own history. No visitor identity is collected by this change.

Public Chat records generated answers, passage fallbacks, missing-note replies and retrieval failure responses. A failed history write produces HTTP 503 with a retry message. Rejected empty messages, unknown profiles and rate-limited requests are not recorded as Q&A. This records each accepted question/answer pair, not a visitor session or a multi-turn transcript. Owner-authored replies and publishing a FAQ are future features that need separate behavior and indexing decisions.

Apply `supabase/profile-questions.sql` after the base and multitenant migrations and before deploying the updated chat API. It adds nullable `answer`, JSON `sources`, and an owner/date/ID index. Existing question records stay available with an explicit “answer was not recorded” message; historical answers cannot be reconstructed. RLS remains enabled with no public access policies.
