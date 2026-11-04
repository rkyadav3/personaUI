import { createHash, randomUUID } from 'node:crypto';
import { STUDIO_ENTITIES, STUDIO_MAX_ACTIONS, studioDiff } from '../shared/studioAssistant.js';
import { ACCENTS, BG_MODES, FONTS, PAGE_DEFAULTS, PLACEMENTS, normalizePage } from '../shared/pageSettings.js';
import { normalizeBg } from '../shared/siteSettings.js';
import { ICON_NAMES, PORTFOLIO_DEFAULTS, PORTFOLIO_PAGES, SOCIAL_KINDS, cleanImg, cleanUrl, normalizePortfolio } from '../shared/portfolio.js';
import { UPDATE_KINDS, normalizeUpdate, updateProblem } from '../shared/engage.js';
import { CATEGORIES, INTENTS, OFFERING_FIELDS, VISIBILITY_DEFAULTS } from '../shared/profileSchema.js';
import { ENQUIRY_STATUS, ENQUIRY_TYPES } from '../shared/enquiryTypes.js';
import { isText } from './extract.js';
import { normalizeDraft, normalizeVisibility } from './profile.js';
import { HttpError } from './http.js';

const fail = message => { throw new HttpError(400, message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const copy = value => structuredClone(value);
const owns = (value, key) => Object.hasOwn(value || {}, key);
const trim = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const ARRAYS = { projects: 24, products: 24, experience: 20, talks: 24, awards: 3, domains: 8, socials: 7, stats: 4 };
const SINGLE = new Set(['profile', 'portfolio', 'look', 'persona', 'portrait', 'background', 'payments', 'knowledge']);
const referenceFields = new Set(['parentId', 'folderId', 'topicId', 'contributionId', 'templateId']);
const bools = new Set(['featured', 'enabled', 'active', 'visible', 'pinned', 'fulfilled', 'locked', 'revoked', 'removeImage', 'show', 'on', 'mic', 'sources', 'parallax', 'requirePhone', 'showAttendees', 'required']);
const numbers = new Set(['amount', 'price', 'zoom', 'x', 'y', 'blur', 'brightness', 'dim', 'ballOpacity', 'size', 'radius', 'maxWidth', 'wash', 'refraction', 'tint', 'dispersion', 'rim', 'shadow', 'maxUses', 'days', 'total_years']);
const nested = {
  theme: 'bg bgColor font radius maxWidth wash', glass: 'on refraction blur tint dispersion rim shadow', sections: 'store expertise education experience',
  chat: 'mic sources', layout: 'sidebar photo', ball: 'show size', availability: 'show text', cta: 'label url', intro: 'label url', navCta: 'label url',
  rsvp: 'enabled showAttendees requirePhone questions', enquiry: 'enabled title intro thanks types',
};

function safeTree(value, depth = 0) {
  if (depth > 8) fail('This field is too deeply nested.');
  if (typeof value === 'string' && value.length > 16000) fail('This field is too long. Use a smaller edit or append new text.');
  if (Array.isArray(value)) { if (value.length > 50) fail('This field has too many items.'); value.forEach(item => safeTree(item, depth + 1)); }
  else if (object(value)) for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype', 'owner_id', 'ownerId', 'password', 'password_hash', 'keySecret'].includes(key)) fail(`Unsafe or uneditable field: ${key}.`);
    if (bools.has(key) && typeof item !== 'boolean') fail(`${key} must be true or false.`);
    if (numbers.has(key) && item !== null && (typeof item !== 'number' || !Number.isFinite(item))) fail(`${key} must be a number.`);
    if (nested[key] && object(item)) for (const child of Object.keys(item)) if (!nested[key].split(' ').includes(child)) fail(`Uneditable field: ${key}.${child}.`);
    safeTree(item, depth + 1);
  }
}

function validateValues(name, values) {
  const objects = new Set(['theme', 'glass', 'sections', 'placement', 'chat', 'layout', 'availability', 'cta', 'intro', 'navCta', 'rsvp', 'enquiry', 'visibility', 'contact', 'details', 'navLabels']);
  if (name === 'persona') objects.add('ball');
  if (name === 'portfolio') objects.add('about');
  if (name === 'profile') objects.add('experience');
  const arrays = new Set(['chips', 'education', 'expertise']);
  for (const [key, value] of Object.entries(values)) {
    if (objects.has(key)) { if (!object(value)) fail(`${key} must be an object of editable fields.`); }
    else if (arrays.has(key)) { if (!Array.isArray(value)) fail(`${key} must be a list.`); }
    else if (bools.has(key) || name === 'background' && key === 'ball') { if (typeof value !== 'boolean') fail(`${key} must be true or false.`); }
    else if (referenceFields.has(key)) { if (value !== null && typeof value !== 'string' && !(Number.isSafeInteger(value) && value > 0)) fail(`${key} must be a valid record ID.`); }
    else if (numbers.has(key)) { if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) fail(`${key} must be a number.`); }
    else if (value !== null && typeof value !== 'string') fail(`${key} must be text.`);
  }
  const choices = (value, allowed, label) => { if (value !== undefined && !allowed.includes(value)) fail(`Choose a valid ${label} value.`); };
  const shape = (value, keys, label) => {
    if (value === undefined) return;
    if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) fail(`Uneditable field in ${label}.`);
  };
  const textFields = (value, keys, label) => {
    shape(value, keys, label);
    for (const item of Object.values(value || {})) if (item !== null && typeof item !== 'string') fail(`${label} fields must be text.`);
  };
  const booleanFields = (value, keys, label) => {
    shape(value, keys, label);
    for (const item of Object.values(value || {})) if (typeof item !== 'boolean') fail(`${label} fields must be true or false.`);
  };
  const recordList = (value, keys, max, label, check) => {
    if (value === undefined) return;
    if (!Array.isArray(value) || value.length > max) fail(`${label} must be a list of up to ${max} items.`);
    value.forEach(item => { shape(item, keys, label); check(item); });
  };
  if (name === 'portfolio') textFields(values.about, ['title', 'body', 'skills'], 'About');
  if (name === 'profile') {
    textFields(values.contact, ['email', 'phone', 'location', 'other'], 'Contact');
    shape(values.visibility, Object.keys(VISIBILITY_DEFAULTS), 'Visibility');
    if (values.visibility) {
      const { contact, ...toggles } = values.visibility;
      booleanFields(toggles, Object.keys(VISIBILITY_DEFAULTS).filter(key => key !== 'contact'), 'Visibility');
      booleanFields(contact, Object.keys(VISIBILITY_DEFAULTS.contact), 'Contact visibility');
    }
    recordList(values.education, ['qualification', 'specialization', 'institution'], 6, 'Education', item => textFields(item, ['qualification', 'specialization', 'institution'], 'Education'));
    shape(values.experience, ['total_years', 'description', 'employers'], 'Experience');
    if (values.experience?.description !== undefined && typeof values.experience.description !== 'string') fail('Experience description must be text.');
    recordList(values.experience?.employers, ['company', 'role', 'duration'], 10, 'Employers', item => textFields(item, ['company', 'role', 'duration'], 'Employers'));
    if (values.expertise && (values.expertise.length > 20 || values.expertise.some(item => typeof item !== 'string'))) fail('Expertise must be a list of text values.');
  }
  recordList(values.chips, ['label', 'prompt'], 6, 'Chat suggestions', item => textFields(item, ['label', 'prompt'], 'Chat suggestions'));
  recordList(values.rsvp?.questions, ['id', 'label', 'required'], 6, 'Event questions', item => { textFields(fieldsOf(item, ['id', 'label']), ['id', 'label'], 'Event questions'); if (owns(item, 'required') && typeof item.required !== 'boolean') fail('Required must be true or false.'); });
  booleanFields(values.sections, ['store', 'expertise', 'education', 'experience'], 'Sections');
  textFields(values.cta, ['label', 'url'], 'Call to action');
  if (name === 'portfolio') textFields(values.intro, ['label', 'url'], 'Intro link');
  textFields(values.navCta, ['label', 'url'], 'Navigation link');
  shape(values.availability, ['show', 'text'], 'Availability');
  if (owns(values.availability, 'text') && typeof values.availability.text !== 'string') fail('Availability text must be text.');
  if (owns(values.enquiry, 'types') && (!Array.isArray(values.enquiry.types) || values.enquiry.types.some(type => !Object.hasOwn(ENQUIRY_TYPES, type)))) fail('Choose valid enquiry types.');
  for (const [parent, keys] of [['theme', ['bg', 'bgColor', 'font']], ['layout', ['sidebar', 'photo']], ['enquiry', ['title', 'intro', 'thanks']]]) {
    for (const key of keys) if (owns(values[parent], key) && typeof values[parent][key] !== 'string') fail(`${parent}.${key} must be text.`);
  }
  if (name === 'updates') { choices(values.kind, Object.keys(UPDATE_KINDS), 'update kind'); choices(values.status, ['draft', 'published'], 'publication status'); }
  if (name === 'contributions') choices(values.intent, INTENTS, 'offering intent');
  choices(values.accent, Object.keys(ACCENTS), 'accent');
  choices(values.theme?.bg, Object.keys(BG_MODES), 'background');
  choices(values.theme?.font, Object.keys(FONTS), 'font');
  choices(values.layout?.photo, ['left', 'right', 'none'], 'photo layout');
  choices(values.layout?.sidebar, ['left', 'right'], 'sidebar layout');
  choices(values.photoStyle, ['bw', 'color'], 'photo style');
  choices(values.icon, ['', ...ICON_NAMES], 'icon');
  if (name === 'socials') choices(values.kind, Object.keys(SOCIAL_KINDS), 'social link kind');
  for (const [category, placement] of Object.entries(values.placement || {})) {
    if (!CATEGORIES.includes(category)) fail('Choose a valid category for placement.');
    choices(placement, Object.keys(PLACEMENTS), 'placement');
  }
  for (const [page, label] of Object.entries(values.navLabels || {})) if (!PORTFOLIO_PAGES.includes(page) || typeof label !== 'string') fail('Choose a valid navigation label field.');
  for (const key of ['accentHex']) if (owns(values, key) && values[key] && !/^#[0-9a-f]{6}$/i.test(values[key])) fail(`${key} must be a six-digit hex colour.`);
  if (values.theme?.bgColor && !/^#[0-9a-f]{6}$/i.test(values.theme.bgColor)) fail('Use a valid background colour.');
}
const fieldsOf = (value, keys) => Object.fromEntries(Object.entries(value || {}).filter(([key]) => keys.includes(key)));
export function studioMerge(before, patch) {
  safeTree(patch);
  const result = object(before) ? copy(before) : {};
  for (const [key, value] of Object.entries(patch || {})) result[key] = object(value) ? studioMerge(result[key], value) : copy(value);
  return result;
}
const stable = value => Array.isArray(value) ? value.map(stable) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export const studioFingerprint = value => createHash('sha256').update(JSON.stringify(stable(value ?? null))).digest('hex');
export const studioText = html => String(html || '').replace(/<\/(?:p|div|h[1-6]|li)>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const studioHtml = text => String(text || '').split(/\r?\n/).map(line => {
  const heading = /^(#{1,3})\s+(.+)$/.exec(line);
  return heading ? `<h${heading[1].length}>${escape(heading[2])}</h${heading[1].length}>` : `<p>${escape(line) || '<br>'}</p>`;
}).join('');

export function studioRecords(state, name) {
  const item = STUDIO_ENTITIES[name];
  if (!item) fail('Unknown assistant area.');
  if (ARRAYS[name]) return (state.settings?.portfolio?.[name] || []).map((row, index) => ({ ...row, id: name === 'products' ? row.id : `index:${index}` }));
  if (['portfolio', 'look', 'persona', 'portrait', 'background'].includes(name)) {
    const settings = state.settings || {}, source = name === 'portfolio' ? settings.portfolio : name === 'background' ? settings.bg : name === 'portrait' ? settings.page?.hero : settings.page;
    return [{ ...Object.fromEntries(item.fields.filter(key => owns(source, key)).map(key => [key, source[key]])), id: 'current' }];
  }
  if (SINGLE.has(name)) return state[item.root] ? [{ ...state[item.root], id: name === 'profile' ? state.profile.id : 'current' }] : [];
  return state[item.root] || [];
}

const redact = value => Array.isArray(value) ? value.map(redact) : object(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => !/password|secret|token|storage_path|owner_id|delivery_?url|original_text|ai_extracted|field_sources/i.test(key)).map(([key, item]) => [key, redact(item)])) : typeof value === 'string' && value.length > 12000 ? '[Content is too long to replace. Use appendText or appendBody.]' : value;
export function studioModelContext(state, entities, user) {
  return Object.fromEntries(entities.map(name => {
    const spec = STUDIO_ENTITIES[name];
    if (!spec || spec.admin && !user?.isAdmin) throw new HttpError(403, 'You do not have permission for that admin area.');
    const rows = studioRecords(state, name);
    const referenceRoots = { files: ['folders', 'topics'], folders: ['folders'], posts: ['topics', 'templates'], offerings: ['contributions'], contributions: ['offerings'], responses: ['updates'] };
    const references = Object.fromEntries((referenceRoots[name] || []).map(root => [root, (state[root] || []).slice(0, 80).map(row => fieldsOf(row, ['id', 'name', 'title', 'category', 'subtype', 'eventId']))]));
    return [name, { total: rows.length, references, records: rows.slice(0, 80).map(row => {
      const readFields = {
        files: ['mime', 'size'],
        purchases: ['buyer', 'amount', 'currency', 'kind', 'itemId', 'refundedAmount', 'createdAt', 'paidAt', 'paymentId', 'orderId'],
        responses: ['email', 'phone', 'answers', 'note', 'publicName', 'createdAt', 'updatedAt'],
        enquiries: ['name', 'email', 'phone', 'organisation', 'location', 'message', 'kind', 'offeringId', 'offeringTitle', 'prefDate', 'prefTime', 'prefContact', 'meetingMode', 'budget', 'createdAt'],
        payments: ['mode', 'configured', 'webhookConfigured', 'encryptionReady', 'testMode'],
        knowledge: ['files', 'bytes', 'posts', 'drafts', 'topics', 'chunks', 'embedded'],
        users: ['email', 'slug', 'createdAt', 'lockedUntil', 'profileStatus', 'designation'],
        invites: ['code', 'uses', 'expiresAt', 'revoked', 'createdAt'],
      };
      const values = Object.fromEntries(['id', 'name', 'title', 'subject', 'status', 'response', 'eventId', 'label', 'configured', 'isLocked', 'isAdmin', ...spec.fields, ...(readFields[name] || [])].filter(key => owns(row, key)).map(key => [key, row[key]]));
      if (name === 'posts' || name === 'templates') values.body = studioText(row.html);
      if (row.deliveryUrl) values.accessReady = true;
      return redact(values);
    }) }];
  }));
}

function reference(state, name, id) {
  if (id === null || id === undefined || id === '') return null;
  const row = (state[name] || []).find(item => String(item.id) === String(id));
  if (!row) fail(`Choose one of your own ${name}; that target was not found.`);
  return row.id;
}
function requireText(value, label) { if (!trim(value)) fail(`${label} is required.`); }
function price(value, amountKey) {
  if (!['free', 'paid', 'unspecified'].includes(value.pricing)) fail('Choose free, paid or unspecified pricing.');
  if (value.pricing === 'paid' && (!(value[amountKey] > 0) || value[amountKey] >= 1e7)) fail('A paid item needs a positive price amount below 10000000.');
  if (value.currency && !/^[A-Z]{3}$/.test(String(value.currency).toUpperCase())) fail('Use a three-letter currency.');
}
function urls(values) {
  for (const [key, value] of Object.entries(values)) {
    if (['url', 'demoUrl', 'repoUrl'].includes(key) && value && !cleanUrl(value)) fail(`Use a valid link for ${key}.`);
    if (['image', 'deliveryUrl'].includes(key) && value && !cleanImg(value)) fail(`Use an HTTP or HTTPS image/access link for ${key}.`);
    if (object(value)) urls(value);
  }
}
const labelFor = (name, row) => row?.title || row?.name || row?.label || row?.category || row?.company || row?.role || row?.subject || STUDIO_ENTITIES[name].label;

function rejectLinkedBatch(actions, state) {
  const same = (a, b) => a != null && b != null && String(a) === String(b);
  for (const deletion of actions.filter(action => action?.action === 'delete')) {
    const deletedFolders = new Set();
    if (deletion.entity === 'folders') {
      deletedFolders.add(String(deletion.id));
      let count;
      do { count = deletedFolders.size; (state.folders || []).filter(row => row.parentId != null && deletedFolders.has(String(row.parentId))).forEach(row => deletedFolders.add(String(row.id))); } while (deletedFolders.size !== count);
    }
    for (const action of actions) {
      if (action === deletion) continue;
      const row = (state[STUDIO_ENTITIES[action?.entity]?.root] || []).find?.(item => same(item.id, action.id));
      const values = action?.values || {};
      const folderConflict = deletedFolders.size && (action.entity === 'files' && (deletedFolders.has(String(row?.folderId)) || deletedFolders.has(String(values.folderId))) || action.entity === 'folders' && (deletedFolders.has(String(action.id)) || deletedFolders.has(String(values.parentId))));
      const topicConflict = deletion.entity === 'topics' && ['files', 'posts'].includes(action.entity) && (same(row?.topicId, deletion.id) || same(values.topicId, deletion.id));
      const offeringConflict = deletion.entity === 'contributions' && action.entity === 'offerings' && (same(row?.contributionId, deletion.id) || same(values.contributionId, deletion.id));
      const responseConflict = deletion.entity === 'updates' && action.entity === 'responses' && same(row?.eventId, deletion.id);
      if (folderConflict || topicConflict || offeringConflict || responseConflict) fail('This batch deletes a linked parent and edits its children. Review these changes separately.');
    }
  }
}

export function makeStudioPlan(proposal, input, user) {
  if (!object(proposal) || !Array.isArray(proposal.actions)) fail('The assistant returned an invalid change plan. Try again.');
  if (proposal.actions.some(action => !object(action))) fail('The assistant returned an invalid action field. Try again.');
  if (proposal.actions.length > STUDIO_MAX_ACTIONS) fail('Review at most eight (8) actions at a time. Use a smaller batch.');
  rejectLinkedBatch(proposal.actions, input);
  const state = copy(input), changed = [], steps = [], roots = new Set(), seen = new Set();
  const arrayTargets = Object.fromEntries(Object.keys(ARRAYS).map(name => [name, studioRecords(input, name).map(row => row.id)]));
  let settingsTouched = false, heroPath, path;
  const expected = root => { roots.add(root); };
  const push = (name, mode, before, after, op, args, warning = '', affected = []) => {
    const displayedBefore = before && after ? Object.fromEntries(Object.keys(after).map(key => [key, before[key]])) : before;
    const fields = studioDiff(displayedBefore, after);
    if (mode === 'update' && !fields.length) return;
    changed.push({ id: `change-${changed.length + 1}`, title: `${mode === 'create' ? 'Create' : mode === 'delete' ? 'Delete' : 'Update'} ${labelFor(name, after || before)}`, kind: mode, entity: name, href: STUDIO_ENTITIES[name].href, before: displayedBefore, after, fields, warning, affected });
    steps.push({ op, args, entity: name, title: changed.at(-1).title, href: STUDIO_ENTITIES[name].href });
  };
  for (const action of proposal.actions) {
    if (!object(action) || Object.keys(action).some(key => !['entity', 'action', 'id', 'values'].includes(key))) fail('Unknown operation or unexpected plan field.');
    const { entity: name, action: mode, id } = action, spec = STUDIO_ENTITIES[name];
    if (!spec || !spec.modes.includes(mode) || mode === 'read') fail('Unknown or unsupported change operation.');
    if (spec.admin && !user?.isAdmin) throw new HttpError(403, 'Super Admin permission is required.');
    const values = action.values || {};
    if (!object(values) || Object.keys(values).some(key => !spec.fields.includes(key))) fail(`Uneditable field for ${spec.label}.`);
    safeTree(values); validateValues(name, values); urls(values);
    if (mode !== 'delete' && !Object.keys(values).length) fail('Tell me which fields to change before preparing a review.');
    if (mode === 'delete' && Object.keys(values).length) fail('A deletion must not contain replacement fields.');
    if (mode !== 'create' && !SINGLE.has(name) && !id) fail('Choose an exact target to update or delete.');
    const key = `${name}:${id || 'current'}`;
    if ((spec.root !== 'settings' || ARRAYS[name]) && mode !== 'create' && seen.has(key)) fail('The same target occurs more than once. Review one edit per target.');
    if (mode !== 'create') seen.add(key);
    const rows = studioRecords(state, name), arrayIndex = ARRAYS[name] ? arrayTargets[name].findIndex(target => String(target) === String(id)) : -1;
    const before = SINGLE.has(name) ? rows[0] || null : ARRAYS[name] ? rows[arrayIndex] || null : rows.find(row => String(row.id) === String(id)) || null;
    if (mode !== 'create' && !before && name !== 'profile') fail('That target was not found.');
    if (name === 'profile' && mode !== 'create' && !before) fail('Create your profile first; that target was not found.');
    if (mode === 'create' && SINGLE.has(name) && before) fail('That record already exists. Use update.');
    expected(spec.root);

    if (spec.root === 'settings') {
      settingsTouched = true;
      const settings = state.settings;
      if (!settings) fail('Portfolio settings are not available.');
      if (ARRAYS[name]) {
        const list = settings.portfolio[name], index = arrayIndex;
        if (mode === 'create' && list.length >= ARRAYS[name]) fail(`This section is full (${ARRAYS[name]} items).`);
        if (mode === 'delete') { list.splice(index, 1); arrayTargets[name].splice(index, 1); }
        else {
          const merged = studioMerge(before || (name === 'products' ? { pricing: 'unspecified', currency: 'INR' } : {}), values);
          if (name === 'products') { merged.id = before?.id || randomUUID(); price(merged, 'amount'); }
          if (name === 'projects' && merged.featured) list.forEach(row => { row.featured = false; });
          const normalized = normalizePortfolio({ [name]: [merged] })[name][0];
          if (!normalized) fail(`Give the ${name} item a title or required value.`);
          if (mode === 'create') { list.push(normalized); arrayTargets[name].push(`new:${randomUUID()}`); } else list[index] = normalized;
        }
      } else if (name === 'portfolio') settings.portfolio = mode === 'delete' ? normalizePortfolio(PORTFOLIO_DEFAULTS) : normalizePortfolio(studioMerge(settings.portfolio, values));
      else if (name === 'portrait') { if (mode === 'delete') { heroPath = null; settings.heroUrl = null; } else settings.page.hero = { ...settings.page.hero, ...values }; }
      else if (name === 'background') {
        if (mode === 'delete' || values.removeImage === true) { path = null; settings.imageUrl = null; }
        if (mode === 'delete') settings.bg = normalizeBg(); else { const { removeImage, ...patch } = values; settings.bg = normalizeBg({ ...settings.bg, ...patch }); }
      } else {
        const patch = mode === 'delete' ? Object.fromEntries(spec.fields.map(field => [field, PAGE_DEFAULTS[field]])) : values;
        settings.page = normalizePage(studioMerge(settings.page, patch));
        if (owns(patch, 'storeTitle')) settings.portfolio.productsTitle = settings.page.storeTitle;
      }
      settings.page = normalizePage(settings.page); settings.portfolio = normalizePortfolio(settings.portfolio);
      continue;
    }
    if (name === 'profile') {
      if (mode === 'delete') { push(name, mode, before, null, 'profile.remove', { id: before.id }, 'Your public profile is removed. Knowledge, Portfolio settings and offerings are retained; they are hidden until a profile is published again.'); continue; }
      const merged = studioMerge(before || {}, values), normalized = normalizeDraft({ profile: merged, purpose: { description: merged.purpose } });
      requireText(normalized.profile.name, 'A name'); if (mode === 'create') requireText(normalized.purpose.description, 'Your purpose');
      if (merged.status && !['published', 'draft'].includes(merged.status)) fail('Choose draft or published status.');
      const after = { ...normalized.profile, purpose: normalized.purpose.description, visibility: normalizeVisibility(merged.visibility), status: merged.status || 'draft' };
      const displayBefore = before ? Object.fromEntries(Object.keys(after).map(key => [key, before[key]])) : null;
      push(name, mode, displayBefore, after, 'profile.assistantSave', { id: before?.id, ...after }); continue;
    }
    if (name === 'folders') {
      expected('files');
      if (mode === 'delete') {
        const ids = new Set([before.id]); let count;
        do { count = ids.size; state.folders.filter(row => ids.has(row.parentId)).forEach(row => ids.add(row.id)); } while (count !== ids.size);
        const affected = [{ label: 'Folders', count: ids.size }, { label: 'Files', count: state.files.filter(row => ids.has(row.folderId)).length }];
        push(name, mode, before, null, 'folders.delete', { id: before.id }, 'The folder, its child folders, their files and file index entries will be permanently removed.', affected);
      } else {
        if (mode === 'update' && owns(values, 'parentId')) fail('Moving folders is not supported. Rename the folder or move its files.');
        const after = { name: trim(owns(values, 'name') ? values.name : before?.name, 180), parentId: reference(state, 'folders', values.parentId ?? before?.parentId) }; requireText(after.name, 'Folder name');
        push(name, mode, before, after, mode === 'create' ? 'folders.create' : 'folders.rename', { id: before?.id, parentId: after.parentId, name: after.name });
      }
      continue;
    }
    if (name === 'files') {
      expected('folders'); expected('topics');
      if (mode === 'delete') { push(name, mode, before, null, 'files.delete', { id: before.id }, 'The stored file and its knowledge index entries will be permanently removed.'); continue; }
      const merged = studioMerge(before || { text: '', status: 'draft' }, values), contentChanged = owns(values, 'text') || owns(values, 'appendText');
      requireText(merged.name, 'File name'); if (/[\\/]|\.\./.test(merged.name)) fail('Choose a file name without a folder path.');
      if ((mode === 'create' || contentChanged) && !isText(merged.name)) fail('Commands create or edit text files. Use the upload editor for binary files.');
      if (contentChanged && before && !isText(before.name)) fail('Use the upload editor to replace a binary file.');
      if (owns(values, 'text') && (before?.text?.length || 0) > 12000) fail('This file is too long to replace in one command. Use appendText or its editor.');
      if (owns(values, 'text') && owns(values, 'appendText')) fail('Choose a text replacement or append, not both.');
      const htmlFile = /\.html?$/i.test(merged.name);
      const text = owns(values, 'appendText') ? htmlFile ? `${before?.text || ''}${studioHtml(values.appendText)}` : `${before?.text || ''}\n${values.appendText}` : htmlFile && owns(values, 'text') ? studioHtml(merged.text) : merged.text;
      const after = { name: trim(merged.name, 180), text, folderId: reference(state, 'folders', merged.folderId), topicId: reference(state, 'topics', merged.topicId), status: merged.status };
      if (!['draft', 'published'].includes(after.status)) fail('Choose draft or published status.');
      push(name, mode, before, after, mode === 'create' ? 'files.createText' : 'files.save', { id: before?.id, name: after.name, topicId: after.topicId, folderId: after.folderId, status: after.status, ...(mode === 'create' ? { body: text } : contentChanged ? { text } : {}) }); continue;
    }
    if (name === 'posts' || name === 'templates') {
      expected('topics'); if (name === 'posts') expected('templates');
      if (mode === 'delete') { push(name, mode, { ...before, html: undefined, body: studioText(before.html) }, null, `${name}.delete`, { id: before.id }, 'This record will be permanently removed.'); continue; }
      if (owns(values, 'body') && studioText(before?.html).length > 12000) fail('This content is too long to replace. Use appendBody or its editor.');
      if (owns(values, 'body') && owns(values, 'appendBody')) fail('Choose replacement content or append, not both.');
      let html = owns(values, 'body') ? studioHtml(values.body) : before?.html || '<p></p>';
      if (owns(values, 'appendBody')) html += studioHtml(values.appendBody);
      const after = name === 'posts' ? { title: trim(owns(values, 'title') ? values.title : before?.title || 'Untitled', 180), html, topicId: reference(state, 'topics', owns(values, 'topicId') ? values.topicId : before?.topicId), templateId: reference(state, 'templates', owns(values, 'templateId') ? values.templateId : before?.templateId), status: values.status || before?.status || 'draft' } : { name: trim(owns(values, 'name') ? values.name : before?.name, 180), html };
      requireText(after.title || after.name, 'A title or name');
      if (name === 'posts' && !['draft', 'published'].includes(after.status)) fail('Choose draft or published status.');
      const display = row => row ? { ...row, html: undefined, body: studioText(row.html) } : null;
      push(name, mode, display(before), display(after), name === 'templates' ? 'templates.save' : mode === 'create' ? 'posts.create' : 'posts.save', { id: before?.id, ...after }); continue;
    }
    if (name === 'topics') {
      expected('files'); expected('posts');
      if (mode === 'delete') push(name, mode, before, null, 'topics.delete', { id: before.id }, 'The topic is removed. Linked files and posts remain and lose this topic assignment.', [{ label: 'Linked files', count: state.files.filter(row => row.topicId === before.id).length }, { label: 'Linked posts', count: state.posts.filter(row => row.topicId === before.id).length }]);
      else { const after = { name: trim(owns(values, 'name') ? values.name : before?.name, 180), description: trim(owns(values, 'description') ? values.description : before?.description) }; requireText(after.name, 'Topic name'); push(name, mode, before, after, `topics.${mode}`, { id: before?.id, ...after }); }
      continue;
    }
    if (name === 'updates') {
      expected('responses');
      if (mode === 'delete') push(name, mode, before, null, 'updates.delete', { id: before.id }, before.kind === 'event' ? 'This Event and all its attendance responses will be permanently removed.' : 'This published or draft item will be permanently removed.', before.kind === 'event' ? [{ label: 'Attendance responses', count: state.responses.filter(row => row.eventId === before.id).length }] : []);
      else { const after = normalizeUpdate(studioMerge(before || { status: 'draft' }, values)), problem = updateProblem(after); if (problem) fail(problem); push(name, mode, before, after, 'updates.save', { id: before?.id, ...after }); }
      continue;
    }
    if (name === 'contributions') {
      expected('offerings');
      if (mode === 'delete') push(name, mode, before, null, 'contributions.delete', { id: before.id }, 'This category and all its offerings will be removed.', [{ label: 'Offerings', count: state.offerings.filter(row => row.contributionId === before.id).length }]);
      else { const merged = studioMerge(before || {}, values), entry = normalizeDraft({ purpose: { contributions: [merged] } }).purpose.contributions[0]; if (!entry || !CATEGORIES.includes(merged.category)) fail('Choose a valid offering category.'); const after = { ...entry, enabled: merged.enabled !== false, visible: merged.visible !== false }; push(name, mode, before, after, 'contributions.save', { id: before?.id, ...after }); }
      continue;
    }
    if (name === 'offerings') {
      expected('contributions');
      if (mode === 'delete') { push(name, mode, before, null, 'offerings.delete', { id: before.id }, 'This offering is removed from the shop; existing purchase records remain.'); continue; }
      const after = studioMerge(before || { pricing: 'unspecified', active: true, details: {} }, values);
      after.contributionId = reference(state, 'contributions', after.contributionId); if (!after.contributionId) fail('Choose your offering category first.');
      const cleanText = (value, max) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
      after.title = cleanText(after.title, 160); after.description = cleanText(after.description, 1500);
      requireText(after.title, 'Offering title'); price(after, 'price'); after.deliveryUrl = cleanImg(after.deliveryUrl); after.currency = String(after.currency || 'INR').toUpperCase();
      if (after.pricing !== 'paid') after.price = null;
      const category = state.contributions.find(row => row.id === after.contributionId).category;
      const allowed = (OFFERING_FIELDS[category] || []).map(field => field.key);
      if (Object.keys(after.details || {}).some(key => !allowed.includes(key))) fail('Uneditable offering detail field for this category.');
      for (const field of OFFERING_FIELDS[category] || []) if (owns(after.details, field.key)) {
        const value = after.details[field.key];
        if (typeof value !== 'string' && value !== null) fail('Offering detail fields must be text.');
        if (value && field.options && !field.options.includes(value)) fail('Choose a valid offering detail value.');
        const normalized = cleanText(value, field.type === 'textarea' ? 1000 : 300);
        if (normalized) after.details[field.key] = normalized; else delete after.details[field.key];
      }
      push(name, mode, before, after, 'offerings.save', { ...after, id: before?.id }); continue;
    }
    if (name === 'enquiries') {
      if (mode === 'delete') push(name, mode, before, null, 'enquiries.delete', { id: before.id }, 'This enquiry will be permanently removed.');
      else { const after = { ...before, ...values, note: trim(owns(values, 'note') ? values.note : before.note, 2000) }; if (!ENQUIRY_STATUS.includes(after.status)) fail('Choose a valid enquiry status.'); push(name, mode, before, after, 'enquiries.update', { id: before.id, status: after.status, note: after.note }); }
      continue;
    }
    if (name === 'responses') { expected('updates'); push(name, mode, before, null, 'events.deleteResponse', { id: before.id, eventId: before.eventId }, 'The attendee response is permanently removed and attendance totals change.'); continue; }
    if (name === 'purchases') {
      if (!['paid', 'free'].includes(before.status)) fail('Only completed purchases can be marked fulfilled.');
      const after = { ...before, ...values, note: trim(owns(values, 'note') ? values.note : before.note, 1000) };
      push(name, mode, before, after, 'purchases.fulfill', { id: before.id, fulfilled: after.fulfilled === true, note: after.note }); continue;
    }
    if (name === 'payments') { if (values.enabled && !before.configured) fail('The platform administrator must finish the shared Razorpay setup first.'); push(name, mode, before, { ...before, enabled: values.enabled }, 'payments.saveSettings', { enabled: values.enabled }); continue; }
    if (name === 'knowledge') {
      if (!['sync', 'embed', 'rebuild'].includes(values.task)) fail('Choose sync, embed or rebuild for the knowledge index.');
      push(name, mode, before, { ...before, task: values.task }, `index.${values.task}`, {}, values.task === 'rebuild' ? 'The current index is cleared. Published sources must be synchronized and embedded again.' : 'Published knowledge is synchronized or embedded. This may take a short while.'); continue;
    }
    if (name === 'invites') {
      if (mode === 'create') { const after = { label: trim(values.label, 180), maxUses: values.maxUses ?? 1, days: values.days ?? 14 }; if (!Number.isInteger(after.maxUses) || after.maxUses < 1 || after.maxUses > 1000 || !Number.isInteger(after.days) || after.days < 0 || after.days > 365) fail('Use 1–1000 invite uses and 0–365 days.'); push(name, mode, null, after, 'invites.create', after); }
      else { if (mode === 'update' && (values.revoked !== true || Object.keys(values).some(key => key !== 'revoked'))) fail('Existing invitations can only be revoked.'); push(name, mode, before, { ...before, revoked: true }, 'invites.revoke', { id: before.id }, 'People cannot register with this invitation after it is revoked.'); }
      continue;
    }
    if (name === 'users') {
      if (before.id === user.id && (mode === 'delete' || owns(values, 'locked'))) fail('You cannot delete or lock your own account.');
      if (mode === 'delete') push(name, mode, before, null, 'users.delete', { id: before.id }, 'The account and its owned profile, files, posts, purchases and other linked records will be permanently removed.');
      else {
        const after = { ...before, ...values };
        if (owns(values, 'name')) after.name = trim(values.name, 120) || null;
        if (owns(values, 'email')) { after.email = trim(values.email, 160).toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(after.email)) fail('Use a valid email address.'); }
        if (owns(values, 'slug')) { after.slug = trim(values.slug, 80).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''); requireText(after.slug, 'Profile slug'); }
        const account = Object.fromEntries(['name', 'email', 'slug'].filter(key => owns(values, key)).map(key => [key, after[key]]));
        if (Object.keys(account).length) push(name, mode, before, { ...before, ...account }, 'users.update', { id: before.id, ...account });
        if (owns(values, 'locked')) push(name, mode, { isLocked: before.isLocked }, { isLocked: values.locked }, 'users.setLock', { id: before.id, locked: values.locked });
      }
    }
  }
  if (settingsTouched) {
    const before = input.settings, after = state.settings, fields = studioDiff(before, after);
    if (fields.length) {
      changed.unshift({ id: 'settings', title: 'Update Portfolio, Look & Store and Persona', kind: 'update', entity: 'portfolio', href: '/admin/portfolio', before, after, fields, warning: fields.some(field => field.after === null) ? 'Removed images and deleted items are published when you approve.' : '', affected: [] });
      steps.unshift({ op: 'page.save', entity: 'portfolio', title: 'Save Portfolio and Persona', href: '/admin/portfolio', args: { page: after.page, portfolio: after.portfolio, bg: after.bg, ...(heroPath === null ? { heroPath: null } : {}), ...(path === null ? { path: null } : {}) } });
    }
  }
  if (steps.some(step => step.entity === 'knowledge') && steps.length > 1) fail('Run knowledge index jobs in their own review.');
  return { answer: trim(proposal.answer, 3000), changes: changed, steps, expected: [...roots].map(root => ({ root, hash: studioFingerprint(input[root]) })), entities: [...new Set(proposal.actions.map(action => action.entity))], requiresAdmin: proposal.actions.some(action => STUDIO_ENTITIES[action.entity]?.admin) };
}
