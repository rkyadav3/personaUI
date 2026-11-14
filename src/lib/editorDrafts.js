const drafts = new Map();
export const readEditorDraft = key => drafts.get(key);
export const saveEditorDraft = (key, draft) => drafts.set(key, draft);
export const clearEditorDraft = key => drafts.delete(key);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export const editorDraftChanged = draft => !!draft && !!(!same(draft.page, draft.saved.page) || !same(draft.pf, draft.saved.portfolio) || !same(draft.bg, draft.saved.bg) || draft.pending || draft.pendingBg || draft.removed || draft.removedBg);

// Reapply only edited fields after a content/preview handoff. Concurrent edits to
// the same field require an explicit review rather than silently replacing them.
export function rebaseEditorDraft(draft, latest) {
  const conflicts = [];
  function merge(before, edited, current, path) {
    if (same(before, edited)) return current;
    if (object(before) && object(edited)) return Object.fromEntries([...new Set([...Object.keys(current || {}), ...Object.keys(edited)])].map(key => [key, merge(before[key], edited[key], current?.[key], `${path}.${key}`)]));
    if (!same(before, current) && !same(edited, current)) conflicts.push(path);
    return edited;
  }
  const next = { ...draft, page: merge(draft.saved.page, draft.page, latest.page, 'page'), pf: merge(draft.saved.portfolio, draft.pf, latest.portfolio, 'portfolio'), bg: merge(draft.saved.bg, draft.bg, latest.bg, 'background') };
  if ((draft.pending || draft.removed) && !same(draft.saved.uploadedHeroUrl, latest.uploadedHeroUrl)) conflicts.push('portrait image');
  if ((draft.pendingBg || draft.removedBg) && !same(draft.saved.uploadedImageUrl, latest.uploadedImageUrl)) conflicts.push('background image');
  return { ...next, saved: conflicts.length ? draft.saved : latest, conflicts };
}
