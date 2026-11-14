// Overview opens existing studio tools. It does not execute commands or change content.
export const STUDIO_SHORTCUTS = [
  { label: 'Create a new template', to: '/admin/writing?tab=templates', icon: 'template' },
  { label: 'Write a post', to: '/admin/writing', icon: 'pen' },
  { label: 'Update my persona', to: '/admin/settings?tab=persona', icon: 'spark' },
  { label: 'Organize my files', to: '/admin/files', icon: 'folder' },
];

const ACTIONS = [
  { words: /\btemplates?\b/i, ...STUDIO_SHORTCUTS[0] },
  { words: /\b(posts?|articles?|writing|write|essays?)\b/i, ...STUDIO_SHORTCUTS[1] },
  { words: /\b(persona|chat|background|sphere|orb)\b/i, ...STUDIO_SHORTCUTS[2] },
  { words: /\b(files?|folders?|upload|storage|documents?)\b/i, ...STUDIO_SHORTCUTS[3] },
  { words: /\b(shop|store|products?|offerings?)\b/i, label: 'Manage your Store', to: '/admin/store' },
  { words: /\b(projects?|portfolio)\b/i, label: 'Edit your projects', to: '/admin/activity?tab=projects' },
  { words: /\b(look|appearance|design|font|colou?r|theme|customiz\w*)\b/i, label: 'Customize your portfolio', to: '/admin/settings?tab=look' },
  { words: /\b(purchases?|payments?|orders?|revenue)\b/i, label: 'View purchases', to: '/admin/purchases' },
  { words: /\b(events?|updates?|schedule|attendees?|rsvp)\b/i, label: 'Manage updates and Events', to: '/admin/activity?tab=events' },
  { words: /\b(enquiries|enquiry|inquiries|inquiry|inbox|messages?)\b/i, label: 'Open your enquiries', to: '/admin/enquiries' },
  { words: /\b(knowledge|index|sync|embeddings?)\b/i, label: 'Open the knowledge base', to: '/admin/knowledge' },
  { words: /\b(profile|bio|contact)\b/i, label: 'Edit your profile', to: '/admin/profile' },
];

export function resolveStudioAction(input) {
  const query = typeof input === 'string' ? input.trim().slice(0, 500) : '';
  const action = query && ACTIONS.find(item => item.words.test(query));
  return action ? { label: action.label, to: action.to } : null;
}

export const greetingForHour = hour => hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
