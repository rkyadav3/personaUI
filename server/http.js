export class HttpError extends Error {
  constructor(status, message, errors) { super(message); this.name = 'HttpError'; this.status = status; this.errors = errors; }
}

export function jsonBody(req, limit = 32000) {
  const body = req.body === undefined ? {} : req.body;
  if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)) > limit) throw new HttpError(413, 'This submission is too large.');
  let value = body;
  if (typeof body === 'string') { try { value = JSON.parse(body); } catch { throw new HttpError(400, 'Send a valid form submission.'); } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Send a valid form submission.');
  return value;
}

export function publicError(res, error, area) {
  if (!(error instanceof HttpError)) console.error(area, error?.code || error?.name || 'error');
  return res.status(error instanceof HttpError ? error.status : 500).json({ ok: false, error: error instanceof HttpError ? error.message : 'This request could not be completed. Please try again.', ...(error instanceof HttpError && error.errors ? { errors: error.errors } : {}) });
}
