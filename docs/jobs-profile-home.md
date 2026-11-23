# Jobs Profile and Job Seeker mode

Apply `supabase/jobs-profile-home.sql` after `jobs-profiles.sql`, `staff-permissions.sql` and `tag-visibility.sql` before deploying this version. It is safe to rerun and preserves edited grants and saved answers. Reapply the latest migrations last if older migrations are rerun.

Jobs Profile is a third choice in onboarding and Superadmin/Profile Creator creation. Creator-created accounts still require Superadmin approval. Existing profiles can use the same experience through Master → Edit permissions → Allowed features → **Job Seeker**. This is a feature option, not a new tag. Assign existing tags in Superadmin → Profiles as usual.

Job Seeker is exclusive. Enabling it clears and disables standard feature choices and cannot coexist with Studio or Superadmin grants. Turning it off does not automatically restore permissions: select the desired ordinary features before saving. Any assigned tag enabling Job Seeker switches the account to HOME; unresolved tags still fail closed. Original profile/content is preserved, so switching modes does not automatically publish private legacy content.

HOME (`/admin/home`) contains Profile and Public page editor. Profile contains Basic Details (contact, education/academics, certificates, languages), Working Experience (current and previous entries), Knowledgebase, and Be Natural, Be Positive & Mindset. The mindset tab has sub-tabs for mindset questions, job/family business/enterprise development, profit-making business thoughts, future industry/domain/scope, nation-growth ideas, side-hustle stories/notes and inspirational stories. Knowledgebase has a text field and an Apply for the wishlist checkbox; this is a saved profile preference and does not submit an application. Job Seeker settings in each tag's permissions popup show or hide these sections. Every assigned tag must allow a section. Hidden sections are removed from owner/shared responses and cannot be changed through the API.

The Public page editor controls only Home: title, introduction, HTTPS photo, accent colour, light/dark theme and publication. `/p/:username` renders one Home page with no navigation tabs, chat, shop, jobs or activity. Legacy public endpoints exclude previous data while Job Seeker mode is active. The directory uses the visibility-filtered Jobs Home even if the original profile is a draft.

Each section has three visibility checkboxes. Only one can be selected; selecting it disables the other two. Untick the current choice to select another. Saving requires a choice:

- **Private:** profile owner/administrator and staff explicitly granted Review Jobs Profile details in Superadmin feature access.
- **Public:** appears on a published Home page.
- **Applied jobs only:** available to the receiving job administrator when the signed-in applicant selects Include my Jobs Profile. Public sections accompany that view; Private sections never do.

Nation-growth ideas cannot be Public. Resource and viability fields collect notes; saving an idea does not automatically connect resources or evaluate viability.

Applications still require a résumé file or HTTPS résumé link. The API uses the verified session identity, never a submitted profile ID. Inbox → Enquiries offers View shared Jobs Profile, checking recipient scope and current grants/audiences on every request. Changing to Private removes a section from subsequent recruiter views. Global Private profile tags, suspension, lost Jobs Profile access and unapproved accounts override sharing. Previously downloaded information cannot be revoked.

Job Seekers are excluded from Superadmin Profiles, its dashboard counts and the Profile Creator directory, regardless of their assigned tags. Jobs Profiles contains these accounts, including pending and unsaved accounts for Superadmin approval. Edit profiles & assign tags grants access to their account controls there; Review Jobs Profile details separately grants access to saved private answers. Review-only staff see approved accounts without account-edit controls. Existing tags and platform grants are preserved when editing an account. Creation does not grant review access.

Mindset sub-tabs wrap onto additional rows as the screen narrows, without horizontal scrolling. Private answers live in a separate table without anonymous/authenticated grants and never enter the chatbot knowledge index. Unsaved drafts remain in browser memory across section/in-app navigation; logout clears them.

Verification: `node --test --test-concurrency=4 tests/*.test.js tests/*.test.cjs` and `npm run build`. Browser fixture after starting `npm run dev:web`: `/tests/browser/jobs-profile.html` (editor), `?role=owner` (Master), `?view=/p/asha` (Home). Fixture answers are illustrative test data.
