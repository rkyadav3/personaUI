import { studioCommand } from '../../shared/studioAssistant.js';

export const initialStudioState = userId => ({ userId, input: '', messages: [], review: null, result: null, error: '', busy: '' });
const browserTimeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } };

/** One session belongs to one mounted owner. Late responses cannot change a newer session. */
export function createStudioSession({ userId, call, publish, onApplied, storage, timeZone = browserTimeZone(), now = Date.now }) {
  let state = initialStudioState(userId), active = true, revision = 0, persistence = storage;
  if (persistence === undefined) { try { persistence = globalThis.sessionStorage; } catch { /* Reviews also remain on the server. */ } }
  const key = `studio-review:${userId}`, live = version => active && revision === version;
  const update = patch => { if (active) { state = { ...state, ...patch }; publish?.(state); } };
  const remember = id => { try { if (id) persistence?.setItem(key, id); else persistence?.removeItem(key); } catch { /* Browser recovery is optional. */ } };
  const review = value => { update({ review: value }); remember(value?.id); };
  const notifyApplied = value => { if (['applied', 'partial'].includes(value.status)) onApplied?.(); };
  async function refresh(id, version) {
    try {
      const value = await call('studio.review', { reviewId: id });
      if (!live(version)) return;
      review(value.review); update({ result: value.status === 'pending' ? null : value }); notifyApplied(value);
    } catch (failure) {
      if (!live(version)) return;
      if (failure.status === 404) { review(null); update({ result: null }); }
      update({ error: 'The command status could not be loaded. Check the admin page before creating a new review.' });
    }
  }
  return {
    snapshot: () => state,
    setInput: input => update({ input }),
    dispose() { active = false; revision++; },
    async recover() {
      let id; try { id = persistence?.getItem(key); } catch { return; }
      if (!id || !active || state.busy) return;
      const version = ++revision;
      update({ busy: 'checking', review: { id, status: 'unknown', changes: [] }, result: { status: 'unknown', results: [] } });
      await refresh(id, version);
      if (live(version)) update({ busy: '' });
    },
    async submit() {
      if (!active || state.busy) return;
      if (['running', 'unknown'].includes(state.review?.status)) { update({ error: 'Check this command’s status before creating a new review.' }); return; }
      let message; try { message = studioCommand(state.input); } catch (failure) { update({ error: failure.message }); return; }
      const version = ++revision;
      update({ busy: 'planning', error: '', result: null });
      try {
        if (state.review?.status === 'pending') {
          await call('studio.discard', { reviewId: state.review.id });
          if (!live(version)) return;
          review(null);
        }
        const history = state.messages.slice(-6).map(item => ({ role: item.role, text: item.text.slice(0, 3000) }));
        update({ messages: [...state.messages.slice(-10), { role: 'user', text: message }], input: '' });
        const value = await call('studio.prepare', { message, history, timeZone });
        if (!live(version)) return;
        update({ messages: [...state.messages, { role: 'assistant', text: value.answer || 'Review the proposed changes below.' }] }); review(value.review || null);
      } catch (failure) { if (live(version)) update({ error: failure.message || 'The command could not be planned. Try again.', input: message }); }
      finally { if (live(version)) update({ busy: '' }); }
    },
    async approve() {
      const selected = state.review;
      if (!active || state.busy || selected?.status !== 'pending' || !selected.changes?.length) return;
      if (selected.expiresAt && Date.parse(selected.expiresAt) <= now()) { update({ error: 'This review has expired. Send a new command to review current data.' }); return; }
      const version = ++revision;
      update({ busy: 'applying', error: '' });
      try {
        const value = await call('studio.apply', { reviewId: selected.id, approved: true });
        if (!live(version)) return;
        review({ ...selected, status: value.status }); update({ result: value }); notifyApplied(value);
      } catch (failure) {
        if (!live(version)) return;
        update({ error: failure.message || 'The change could not be confirmed.', result: { reviewId: selected.id, status: 'unknown', results: [], warning: 'Check this command’s status before creating a new draft.' } }); review({ ...selected, status: 'unknown' });
        await refresh(selected.id, version);
      } finally { if (live(version)) update({ busy: '' }); }
    },
    async discard() {
      if (!active || state.busy || state.review?.status !== 'pending') return;
      const version = ++revision, id = state.review.id;
      update({ busy: 'discarding', error: '' });
      try {
        const value = await call('studio.discard', { reviewId: id });
        if (live(version)) { review(null); update({ result: value }); }
      } catch (failure) { if (live(version)) update({ error: failure.message || 'This review could not be discarded.' }); }
      finally { if (live(version)) update({ busy: '' }); }
    },
    async checkStatus() {
      if (!active || state.busy || !state.review?.id) return;
      const version = ++revision, id = state.review.id;
      update({ busy: 'checking', error: '' });
      await refresh(id, version);
      if (live(version)) update({ busy: '' });
    },
  };
}
