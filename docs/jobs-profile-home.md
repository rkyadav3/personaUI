# Jobs Profile and Job Seeker mode

Apply `supabase/jobs-profile-home.sql` after `jobs-profiles.sql`, `staff-permissions.sql` and `tag-visibility.sql` before deploying this version. It is safe to rerun and preserves edited grants and saved answers. Reapply the latest migrations last if older migrations are rerun.

Jobs Profile is a third choice in onboarding and Superadmin/Profile Creator creation. Creator-created accounts still require Superadmin approval. Existing profiles can use the same experience through Master → Edit permissions → Allowed features → **Job Seeker**. This is a feature option, not a new tag. Assign existing tags in Superadmin → Profiles as usual.

Job Seeker is exclusive. Enabling it clears and disables standard feature choices and cannot coexist with Studio or Superadmin grants. Turning it off does not automatically restore permissions: select the desired ordinary features before saving. Any assigned tag enabling Job Seeker switches the account to HOME; unresolved tags still fail closed. Original profile/content is preserved, so switching modes does not automatically publish private legacy content.

HOME (`/admin/home`) contains Profile and Public page editor. Profile contains Basic Details (contact, education/academics, certificates, languages), Working Experience (current and previous entries), and Knowledgebase (mindset, job/family business/enterprise development, profit-making business thoughts, future industry/domain/scope, nation-growth ideas, side-hustle stories/notes and inspirational stories). Job Seeker settings in each tag's permissions popup show or hide these sections. Every assigned tag must allow a section. Hidden sections are removed from owner/shared responses and cannot be changed through the API.

The Public page editor controls only Home: title, introduction, HTTPS photo, accent colour, light/dark theme and publication. `/p/:username` renders one Home page with no navigation tabs, chat, shop, jobs or activity. Legacy public endpoints exclude previous data while Job Seeker mode is active. The directory uses the visibility-filtered Jobs Home even if the original profile is a draft.

Each section has a sharing choice:

- **Private:** profile owner/administrator and staff explicitly granted Review Jobs Profile details in Superadmin feature access.
- **Public:** appears on a published Home page.
- **Applied jobs only:** available to the receiving job administrator when the signed-in applicant selects Include my Jobs Profile. Public sections accompany that view; Private sections never do.

Nation-growth ideas cannot be Public. Resource and viability fields collect notes; saving an idea does not automatically connect resources or evaluate viability.

Applications still require a résumé file or HTTPS résumé link. The API uses the verified session identity, never a submitted profile ID. Inbox → Enquiries offers View shared Jobs Profile, checking recipient scope and current grants/audiences on every request. Changing to Private removes a section from subsequent recruiter views. Global Private profile tags, suspension, lost Jobs Profile access and unapproved accounts override sharing. Previously downloaded information cannot be revoked.

Superadmin/staff granted Review Jobs Profile details can open Jobs Profiles in platform navigation. Creation does not grant review access. Private answers live in a separate table without anonymous/authenticated grants and never enter the chatbot knowledge index. Unsaved drafts remain in browser memory across section/in-app navigation; logout clears them.

Verification: `node --test --test-concurrency=4 tests/*.test.js tests/*.test.cjs` and `npm run build`. Browser fixture after starting `npm run dev:web`: `/tests/browser/jobs-profile.html` (editor), `?role=owner` (Master), `?view=/p/asha` (Home). Fixture answers are illustrative test data.
