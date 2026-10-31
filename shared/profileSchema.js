// Shared by the browser and the serverless functions: categories, offering fields, visibility defaults.
export const CATEGORIES = ['Books', 'Content', 'Information & Knowledge', 'In-Person Discussions', 'Advice & Suggestions', 'Talk Shows', 'Other Contributions'];
export const INTENTS = ['free', 'paid', 'mixed', 'unspecified'];
export const PRICING = ['free', 'paid', 'unspecified'];

const t = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const area = (key, label) => ({ key, label, type: 'textarea' });
const sel = (key, label, options) => ({ key, label, type: 'select', options });

/** Category-specific offering fields. Title, description, pricing, price and active are common to all; these go in `details`. */
export const OFFERING_FIELDS = {
  'Books': [t('cover_image', 'Cover image URL'), sel('availability', 'Purchase availability', ['Available now', 'Pre-order', 'Coming soon', 'Out of stock'])],
  'Content': [sel('content_type', 'Content type', ['Article', 'Blog', 'Tutorial', 'Video', 'Course', 'Guide', 'Newsletter', 'Other']), t('access_info', 'Access information')],
  'Information & Knowledge': [t('topic', 'Topic or industry'), t('access_info', 'Access information')],
  'In-Person Discussions': [t('topics', 'Discussion topics'), sel('format', 'Meeting format', ['One-to-one', 'Small group', 'Large group', 'Networking meetup']), t('availability', 'Availability'), t('location', 'Location or meeting arrangement')],
  'Advice & Suggestions': [t('advice_type', 'Type of advice'), t('availability', 'Consultation availability'), t('booking_info', 'Booking information')],
  'Talk Shows': [sel('role', 'Role', ['Host', 'Participant', 'Either']), t('topics', 'Discussion topics'), t('format', 'Format'), t('availability', 'Availability')],
  'Other Contributions': [t('availability', 'Availability'), t('booking_info', 'Booking or access information')],
};

export const VISIBILITY_DEFAULTS = {
  education: true, experience: true, designation: true, expertise: true, purpose: true, contributions: true,
  contact: { email: false, phone: false, location: false, other: false },   // private unless the user publishes it
};

export const VISIBILITY_LABELS = {
  education: 'Education', experience: 'Working experience', designation: 'Designation', expertise: 'Expertise',
  purpose: 'Purpose to join', contributions: 'Contributions',
};
