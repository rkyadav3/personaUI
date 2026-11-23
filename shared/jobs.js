export const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship', 'Volunteer'];
export const WORKPLACE_TYPES = ['On-site', 'Hybrid', 'Remote'];
export const RESUME_LIMIT = 5 * 1024 * 1024;
export const RESUME_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
export function normalizeJob(input = {}) {
  const job = {
    title: text(input.title, 160),
    description: text(input.description, 12000),
    requirements: text(input.requirements, 6000),
    location: text(input.location, 160),
    employment_type: input.employment_type,
    workplace: input.workplace,
    salary: text(input.salary, 160),
    status: input.status,
    closes_at: input.closes_at || null,
  };
  if (
    !job.title ||
    job.description.length < 20 ||
    !JOB_TYPES.includes(job.employment_type) ||
    !WORKPLACE_TYPES.includes(job.workplace) ||
    !['draft', 'published', 'closed'].includes(job.status)
  )
    throw new Error(
      'Enter a title, description of at least 20 characters, employment type, workplace and status.'
    );
  if (job.closes_at && !Number.isFinite(Date.parse(job.closes_at)))
    throw new Error('Choose a valid closing date.');
  return job;
}
export function resumeSpec(input = {}) {
  const extension = text(input.name, 160).split('.').pop().toLowerCase(),
    mime = RESUME_TYPES[extension];
  if (
    !mime ||
    input.mime !== mime ||
    !Number.isSafeInteger(input.size) ||
    input.size < 1 ||
    input.size > RESUME_LIMIT
  )
    throw new Error('Choose a PDF, DOC or DOCX résumé up to 5 MB.');
  return { name: text(input.name, 160), mime, size: input.size, extension };
}
export function normalizeApplication(input = {}) {
  const value = {
    name: text(input.name, 120),
    email: text(input.email, 160).toLowerCase(),
    phone: text(input.phone, 40),
    message: text(input.message, 4000),
    resume_url: text(input.resumeUrl, 1000),
  };
  if (!value.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) || input.consent !== true)
    throw new Error('Enter your name and email, and consent to sharing this application.');
  if (value.resume_url && !/^https:\/\//i.test(value.resume_url))
    throw new Error('Use an HTTPS résumé link.');
  if (!input.resumeId && !value.resume_url) throw new Error('Upload a résumé or provide a résumé link.');
  return value;
}
