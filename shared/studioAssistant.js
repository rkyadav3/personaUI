// These are application capabilities, never executable code or arbitrary API names from the model.
import { ACCENTS, BG_MODES, FONTS, PLACEMENTS } from './pageSettings.js';
import { CATEGORIES, INTENTS, PRICING } from './profileSchema.js';
import { ICON_NAMES, SOCIAL_KINDS } from './portfolio.js';

const entity = (label, root, fields, modes, href, admin = false) => ({ label, root, fields: fields.split(' ').filter(Boolean), modes: ['read', ...modes.split(' ').filter(Boolean)], href, admin });
export const STUDIO_ENTITIES = {
  analytics: entity('Activity analytics: sales, earnings, profile views, persona exchanges and enquiries', 'analytics', '', '', '/admin'),
  profile: entity('Profile details and visibility', 'profile', 'name purpose education contact experience designation expertise visibility status', 'create update delete', '/admin/profile'),
  portfolio: entity('Portfolio home, navigation, about and contact form', 'settings', 'brand greeting heroName titleLine bio photoStyle availability cta intro navCta about navLabels footerNote projectsKicker projectsTitle productsKicker productsTitle enquiry', 'update delete', '/admin/settings?tab=hero'),
  projects: entity('Portfolio projects', 'settings', 'title tag summary description image tech award awardSub year demoUrl demoLabel repoUrl repoLabel featured', 'create update delete', '/admin/settings?tab=projects'),
  products: entity('Free and paid shop products', 'settings', 'title summary icon status image url linkLabel pricing amount currency deliveryUrl', 'create update delete', '/admin/settings?tab=products'),
  experience: entity('Portfolio experience timeline', 'settings', 'role company period summary', 'create update delete', '/admin/settings?tab=experience'),
  talks: entity('Portfolio talks and interviews', 'settings', 'title event date summary url', 'create update delete', '/admin/settings?tab=talks'),
  awards: entity('Portfolio awards', 'settings', 'title sub', 'create update delete', '/admin/settings?tab=hero'),
  domains: entity('What I do', 'settings', 'label icon', 'create update delete', '/admin/settings?tab=hero'),
  socials: entity('Social links', 'settings', 'kind url', 'create update delete', '/admin/settings?tab=hero'),
  stats: entity('Portfolio statistics', 'settings', 'value label', 'create update delete', '/admin/settings?tab=numbers'),
  look: entity('Look and Store appearance and visibility', 'settings', 'accent accentHex theme glass sections placement storeTitle storeSubtitle currency', 'update delete', '/admin/settings?tab=look'),
  persona: entity('Persona Chat greeting and behavior', 'settings', 'headline headlineAccent subtitle placeholder tagline about chips openLabel chat layout ball', 'update delete', '/admin/settings?tab=persona'),
  portrait: entity('Portrait crop or removal; uploads use the photo editor', 'settings', 'zoom x y', 'update delete', '/admin/settings?tab=hero'),
  background: entity('Background image adjustments and removal', 'settings', 'zoom x y blur brightness dim parallax ball ballOpacity removeImage', 'update delete', '/admin/settings?tab=persona'),
  contributions: entity('Offering categories', 'contributions', 'category subtype description intent enabled visible', 'create update delete', '/admin/profile?tab=contrib'),
  offerings: entity('Offerings and their prices and access links', 'offerings', 'contributionId title description pricing price currency details active deliveryUrl', 'create update delete', '/admin/profile?tab=contrib'),
  updates: entity('Announcements, schedule and Events including attendance forms', 'updates', 'kind title body startsAt endsAt location url linkLabel status pinned rsvp', 'create update delete', '/admin/updates'),
  responses: entity('Visitor attendance responses', 'responses', '', 'delete', '/admin/updates'),
  folders: entity('Folders; deletion includes child folders and files', 'folders', 'name parentId', 'create update delete', '/admin/files'),
  files: entity('Files and text notes; binary uploads use the upload button', 'files', 'name text appendText folderId topicId status', 'create update delete', '/admin/files'),
  topics: entity('Research topics', 'topics', 'name description', 'create update delete', '/admin/topics'),
  posts: entity('Posts; body is plain text or Markdown, never raw HTML', 'posts', 'title body appendBody topicId templateId status', 'create update delete', '/admin/writing'),
  templates: entity('Writing templates; body is plain text or Markdown', 'templates', 'name body appendBody', 'create update delete', '/admin/templates'),
  enquiries: entity('Enquiries; edit status and private note', 'enquiries', 'status note', 'update delete', '/admin/enquiries'),
  purchases: entity('Purchases; edit fulfillment and private note only', 'purchases', 'fulfilled note', 'update', '/admin/purchases'),
  payments: entity('Enable or disable this profile’s shared Razorpay checkout', 'payments', 'enabled', 'update', '/admin/settings?tab=payments'),
  knowledge: entity('Knowledge index; sync, embed or rebuild after approval', 'knowledge', 'task', 'update', '/admin/knowledge'),
  invites: entity('Your invite codes; create or revoke existing codes', 'invites', 'label maxUses days revoked', 'create update delete', '/admin/invites'),
  users: entity('User accounts; edit name, email, slug or lock, or delete another account', 'users', 'name email slug locked', 'update delete', '/superadmin/customers', true),
};
export const STUDIO_MAX_ACTIONS = 8;
export const STUDIO_REVIEW_MS = 15 * 60 * 1000;
const guidance = {
  profile: { choices: { status: ['draft', 'published'] }, shape: 'education: [{qualification,specialization,institution}]; contact: {email,phone,location,other}; experience: {total_years,description,employers:[{company,role,duration}]}; expertise: [text]; visibility: {education,experience,designation,expertise,purpose,contributions,contact:{email,phone,location,other}} with boolean visibility values' },
  portfolio: { choices: { photoStyle: ['bw', 'color'] }, shape: 'availability: {show:boolean,text}; cta/intro/navCta: {label,url}; about: {title,body,skills}; navLabels: {home,activity,store,chat,contact}; enquiry: {enabled:boolean,title,intro,thanks,types:[text]}' },
  look: { choices: { accent: Object.keys(ACCENTS), 'theme.bg': Object.keys(BG_MODES), 'theme.font': Object.keys(FONTS), placement: Object.keys(PLACEMENTS) }, shape: 'theme: {bg,bgColor,font,radius,maxWidth,wash}; glass: {on:boolean,refraction,blur,tint,dispersion,rim,shadow}; sections: {store,expertise,education,experience} booleans; placement: {category:store|side|hidden}' },
  persona: { choices: { 'layout.photo': ['left', 'right', 'none'], 'layout.sidebar': ['left', 'right'] }, shape: 'chips: [{label,prompt}]; chat: {mic:boolean,sources:boolean}; layout: {photo,sidebar}; ball: {show:boolean,size:number}' },
  updates: { choices: { kind: ['update', 'schedule', 'event'], status: ['draft', 'published'] }, shape: 'startsAt/endsAt: ISO dates using the provided timezone; rsvp: {enabled,showAttendees,requirePhone,questions:[{id,label,required:boolean}]} with boolean form settings' },
  contributions: { choices: { category: CATEGORIES, intent: INTENTS } },
  offerings: { choices: { pricing: PRICING }, shape: 'contributionId is an existing category ID from references; details: {allowed category field:text}; price:number; currency:three-letter code; active:boolean' },
  products: { choices: { pricing: PRICING, icon: ['', ...ICON_NAMES] }, shape: 'amount:number; currency:three-letter code; missing pricing defaults to unspecified' },
  domains: { choices: { icon: ['', ...ICON_NAMES] } },
  socials: { choices: { kind: Object.keys(SOCIAL_KINDS) } },
  files: { choices: { status: ['draft', 'published'] }, shape: 'text/appendText: plain text; folderId/topicId: existing ID from references or null; names include their text extension' },
  posts: { choices: { status: ['draft', 'published'] }, shape: 'body/appendBody: plain text or Markdown; topicId/templateId: existing ID from references or null' },
  knowledge: { choices: { task: ['sync', 'embed', 'rebuild'] }, shape: 'Each job must run alone. Sync creates pending chunks, embed processes them, rebuild clears the index.' },
};
export const studioCatalog = user => Object.entries(STUDIO_ENTITIES).filter(([, item]) => !item.admin || user?.isSuperAdmin).map(([key, item]) => ({ entity: key, ...item, ...guidance[key] }));

export function studioCommand(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 2000) throw new Error('Write a command of 1 to 2000 characters.');
  return value.trim();
}

export function studioDiff(before, after, prefix = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) return before.flatMap((item, index) => studioDiff(item, after[index], prefix ? `${prefix}.${index}` : String(index)));
  if (object(before) && object(after)) return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => studioDiff(before[key], after[key], prefix ? `${prefix}.${key}` : key));
  return [{ path: prefix || 'Record', before: before ?? null, after: after ?? null }];
}
