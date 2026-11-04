# Overview admin assistant setup

The command bar on `/admin` is the owner's admin assistant. A visitor's `/p/:slug/chat` remains the public persona assistant.

## Enable saved reviews

1. Apply this update to the React app and server API together.
2. In the Supabase SQL Editor, run `supabase/studio-assistant.sql` after the existing `multitenant.sql` and Events/Commerce migrations. It creates `studio_reviews`, an owner-bound table with RLS enabled and no browser permissions. It can be run again.
3. Keep `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SESSION_SECRET`, `GEMINI_API_KEY` and the optional `GEMINI_MODEL` on the server. They are the existing app settings; no new secret is required. The assistant uses the same Gemini configuration as profile registration.
4. Restart `npm run dev` (`vercel dev`) locally, or deploy the updated app and API to Vercel. The admin API already allows 60 seconds; planning shares a 45-second Gemini timeout.

## Use commands

| Command | Expected behavior |
|---|---|
| `Show my projects` | Reads existing records without an approval button. |
| `Change my title to Product Designer` | Reviews the current title and the proposed replacement. |
| `Create a published event tomorrow at 5pm called Design Meetup with a required question: What brings you here?` | Reviews the date, Event details and visitor form. Dates use the browser timezone. |
| `Make Creator Guide free` | Reviews pricing while preserving its existing access link and other products. |
| `Move notes.md into Research` | Chooses an existing owner folder and reviews the move. |
| `Add a conclusion to my draft post about Design` | Preserves existing text, reviews the addition, and asks for clarification if the target is ambiguous. |
| `Mark the completed purchase from Buyer as fulfilled and add a note: Delivered` | Changes fulfillment and the private note, preserving financial records. |
| `Delete the old meetup` | Reviews the exact Event and the number of attendance responses removed with it. |

Choose **Approve and apply** only after checking the proposed values and deletion warnings. **Discard** removes the pending review without changing content. To revise a proposal, send another command; the old pending proposal is discarded before a new review is created. Approval applies the server's saved plan, and the browser cannot replace it with other changes.

## Recovery and limits

- Reviews expire after 15 minutes and contain at most eight requested actions. Settings are merged into one save. Dependent deletion/edit batches and knowledge jobs need separate reviews.
- If any affected data changed after preview, the server refuses approval and asks for a new review. Each review can be claimed once, even when requests overlap.
- Failed batches stop at the failed step. Completed steps remain applied; the result identifies failures and steps not attempted. Check linked admin pages before preparing a new review when a step's outcome is uncertain.
- Reloading the same browser tab recovers its last review ID. An unknown or running review must have its status checked before another command is prepared. Reviews do not automatically reapply after a lost response or reload.
- The model sees up to 80 records per selected area and safe reference IDs/names. Oversized context is rejected; use focused commands or the existing editor for large replacements. Long text can be appended while preserving the original.
- Portrait/background cropping and removal support commands. New image and binary uploads use the existing upload controls. Password resets remain in the account editor. Existing invites can be revoked; new accounts register through the normal invitation flow.
- Purchase commands edit fulfillment and private notes. Paid checkout can be enabled or disabled after the shared Razorpay setup is complete. Credentials, amounts and payment status cannot be changed by the assistant.
- `Sync my knowledge` creates pending chunks. `Embed my knowledge` processes a slice and reports remaining work. `Rebuild my knowledge` reviews clearing the current index; then sync and embed again. These jobs use the existing indexer and should run alone.
- Regular owners can only manage their own rows. Super Admin users can manage accounts and invitation codes; they cannot delete or lock their own account through a command.

## Check after setup

Plan a title edit and confirm that the live Portfolio is unchanged. Discard it and check again. Plan the edit once more, approve it, and verify the live Portfolio. Reload a pending review to confirm recovery, and try a read command. Run `npm test`, `npm run test:coverage`, and `npm run build` for the automated checks. Real Gemini responses and persistence should also be checked in the configured app.
