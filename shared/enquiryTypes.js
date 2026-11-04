// The choices on the enquiry form. Shared by the form, the server check and the admin inbox.
export const ENQUIRY_TYPES = {
  general: 'General question',
  offering: 'About a book, course or offering',
  booking: 'Book a session or consultation',
  meeting: 'Meet in person or join a group discussion',
  speaking: 'Invite to speak or join a talk show',
  collab: 'Collaboration or partnership',
  feedback: 'Feedback or testimonial',
  other: 'Something else',
};
export const SCHEDULING_TYPES = ['booking', 'meeting', 'speaking', 'collab'];   // these also ask for date, time, mode and budget
export const TIME_SLOTS = ['Morning', 'Afternoon', 'Evening', 'Flexible'];
export const CONTACT_METHODS = ['Email', 'Phone call', 'WhatsApp', 'Any'];
export const MEETING_MODES = ['Online', 'In person', 'No preference'];
export const ENQUIRY_STATUS = ['new', 'read', 'replied', 'archived'];
