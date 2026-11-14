// One definition for editor controls, assistant validation and public rendering.
const select = (label, options, value, area = 'appearance', advanced = false) => ({ label, options, default: value, area, advanced, type: 'select' });
const toggle = (label, value, area) => ({ label, default: value, area, type: 'boolean' });
const range = (label, min, max, value, area, advanced = false) => ({ label, min, max, default: value, area, advanced, type: 'number' });
const list = (label, options, value, area, ordered = false) => ({ label, options, default: value, area, ordered, type: 'list' });
const text = (label, value, area, max = 120) => ({ label, default: value, area, max, type: 'text' });
export const CUSTOMIZATION_FIELDS = {
  preset: select('Starting style', ['balanced', 'editorial', 'minimal'], 'balanced'),
  scheme: select('Colour mode', ['light', 'dark', 'auto'], 'light'),
  textScale: range('Text size (%)', 90, 125, 100, 'appearance'),
  spacing: select('Section spacing', ['compact', 'comfortable', 'spacious'], 'comfortable'),
  buttonStyle: select('Button shape', ['rounded', 'square', 'pill'], 'rounded'),
  navStyle: select('Navigation style', ['links', 'pills'], 'links', 'navigation'),
  navOrder: list('Menu order', ['home', 'activity', 'store', 'chat', 'contact'], ['home', 'activity', 'store', 'chat', 'contact'], 'navigation', true),
  footerLayout: select('Footer layout', ['spread', 'center', 'minimal'], 'spread', 'navigation'),
  heroLayout: select('Introduction layout', ['classic', 'centered', 'reversed'], 'classic', 'home'),
  heroAlign: select('Heading alignment', ['left', 'center'], 'center', 'home'),
  introButton: toggle('Show introduction button', true, 'home'),
  photoShape: select('Portrait shape', ['circle', 'rounded', 'square'], 'circle', 'home'),
  homeOrder: list('Section order', ['intro', 'updates', 'events', 'projects', 'store', 'about'], ['intro', 'updates', 'events', 'projects', 'store', 'about'], 'home', true),
  homeHidden: list('Hidden sections', ['intro', 'updates', 'events', 'projects', 'store', 'about'], [], 'home'),
  homeLimit: range('Items in each Home section', 1, 12, 12, 'home'),
  homeFeaturedItems: { label: 'Featured Store items', default: [], area: 'home', type: 'references', max: 12 },
  homeAwards: { label: 'Highlighted awards', default: [], area: 'home', type: 'references', max: 3 },
  activityLayout: select('Activity layout', ['cards', 'timeline'], 'cards', 'activity'),
  activitySections: list('Visible categories', ['projects', 'events', 'talks', 'recognition', 'awards', 'certificates', 'testimonials', 'experience'], ['projects', 'events', 'talks', 'recognition', 'awards', 'certificates', 'testimonials', 'experience'], 'activity'),
  activityDefault: select('Opening category', ['projects', 'events', 'talks', 'recognition', 'awards', 'certificates', 'testimonials', 'experience'], 'projects', 'activity'),
  activityLimit: range('Items per category', 1, 24, 24, 'activity', true),
  activitySort: select('Activity order', ['saved', 'title', 'newest'], 'saved', 'activity'),
  activityDates: toggle('Show dates and years', true, 'activity'),
  activityDescriptions: toggle('Show summaries', true, 'activity'),
  storeLayout: select('Store layout', ['grid', 'list'], 'grid', 'store'),
  storeColumns: range('Desktop columns', 2, 4, 3, 'store'),
  storeCardSize: select('Card spacing', ['compact', 'comfortable'], 'comfortable', 'store'),
  storeImageRatio: select('Image proportions', ['square', 'landscape', 'wide'], 'landscape', 'store'),
  storeFilters: toggle('Show category filters', false, 'store'),
  storeSort: select('Default item order', ['saved', 'title', 'price_low', 'price_high'], 'saved', 'store'),
  storePrices: toggle('Show prices', true, 'store'),
  storeBadges: toggle('Show status badges', true, 'store'),
  storeDescriptions: toggle('Show descriptions', true, 'store'),
  chatWelcome: text('Empty conversation message', '', 'chat', 300),
  chatBubbleStyle: select('Message style', ['rounded', 'compact'], 'rounded', 'chat'),
  chatSuggestions: toggle('Show suggested questions', true, 'chat'),
  chatStore: toggle('Show Store items beside Chat', true, 'chat'),
  contactLayout: select('Contact layout', ['centered', 'sidebar'], 'centered', 'contact'),
  contactWidth: select('Form width', ['comfortable', 'wide'], 'wide', 'contact'),
  contactDetails: toggle('Show direct contact details', true, 'contact'),
  contactFields: list('Optional form fields', ['phone', 'organisation', 'location', 'budget'], ['phone', 'organisation', 'location', 'budget'], 'contact'),
  contactButton: text('Submit button text', 'Send enquiry', 'contact', 40),
};
for (const area of ['home', 'activity', 'store', 'chat', 'contact']) {
  CUSTOMIZATION_FIELDS[`${area}Scheme`] = select('Page colour mode', ['inherit', 'light', 'dark', 'auto'], 'inherit', area, true);
  CUSTOMIZATION_FIELDS[`${area}Font`] = select('Page font', ['inherit', 'sans', 'serif', 'system', 'mono'], 'inherit', area, true);
  CUSTOMIZATION_FIELDS[`${area}Accent`] = { label: 'Page accent (blank uses site colour)', default: '', area, advanced: true, type: 'colour' };
}
export const CUSTOMIZATION_DEFAULTS = Object.fromEntries(Object.entries(CUSTOMIZATION_FIELDS).map(([key, field]) => [key, structuredClone(field.default)]));
export const STYLE_PRESETS = {
  balanced: { spacing: 'comfortable', buttonStyle: 'rounded', heroLayout: 'classic', activityLayout: 'cards', storeLayout: 'grid' },
  editorial: { spacing: 'spacious', buttonStyle: 'square', heroLayout: 'centered', activityLayout: 'timeline', storeLayout: 'list' },
  minimal: { spacing: 'compact', buttonStyle: 'rounded', heroLayout: 'reversed', activityLayout: 'cards', storeLayout: 'grid' },
};
export function customizationProblem(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return 'Customization must be an object of settings.';
  for (const [key, value] of Object.entries(patch)) {
    const field = CUSTOMIZATION_FIELDS[key];
    if (!Object.hasOwn(CUSTOMIZATION_FIELDS, key)) return `Unknown customization: ${key}.`;
    if (field.type === 'boolean' && typeof value !== 'boolean') return `${field.label} must be true or false.`;
    if (field.type === 'number' && (!Number.isInteger(value) || value < field.min || value > field.max)) return `${field.label} must be between ${field.min} and ${field.max}.`;
    if (field.type === 'select' && !field.options.includes(value)) return `Choose a valid ${field.label.toLowerCase()}.`;
    if (['text', 'colour'].includes(field.type) && (typeof value !== 'string' || value.length > (field.max || 7))) return `${field.label} has an invalid value.`;
    if (field.type === 'colour' && value !== '' && !/^#[0-9a-f]{6}$/i.test(value)) return 'Use a six-digit hex colour.';
    if (['list', 'references'].includes(field.type)) {
      if (!Array.isArray(value) || new Set(value).size !== value.length || value.some(item => typeof item !== 'string')) return `${field.label} must contain distinct choices.`;
      if (field.options && value.some(item => !field.options.includes(item))) return `Choose valid ${field.label.toLowerCase()}.`;
      if (field.ordered && value.length !== field.options.length) return `${field.label} must include every section once.`;
      if (value.length > (field.max || field.options?.length || 24)) return `Too many ${field.label.toLowerCase()}.`;
      if (key === 'activitySections' && !value.length) return 'Keep at least one Activity category visible.';
    }
  }
  return '';
}
export function normalizeCustomization(input) {
  const result = structuredClone(CUSTOMIZATION_DEFAULTS);
  for (const [key, value] of Object.entries(input || {})) if (Object.hasOwn(CUSTOMIZATION_FIELDS, key) && !customizationProblem({ [key]: value })) result[key] = structuredClone(value);
  if (!result.activitySections.includes(result.activityDefault)) result.activityDefault = result.activitySections[0];
  return result;
}
export const applyStylePreset = (value, preset) => normalizeCustomization({ ...value, ...STYLE_PRESETS[preset], preset });
export function customizePageStyle(page, area) {
  const c = normalizeCustomization(page.customization), scheme = c[`${area}Scheme`] === 'inherit' ? c.scheme : c[`${area}Scheme`];
  const font = c[`${area}Font`] === 'inherit' ? page.theme.font : c[`${area}Font`];
  return { ...page, customization: c, accentHex: c[`${area}Accent`] || page.accentHex, theme: { ...page.theme, font }, scheme };
}
