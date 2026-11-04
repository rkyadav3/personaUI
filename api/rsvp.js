import { attendanceSummary, submitAttendance } from '../server/events.js';
import { jsonBody, publicError } from '../server/http.js';

export function rsvpHandler(service = { summary: attendanceSummary, submit: submitAttendance }) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.method === 'GET') return res.status(200).json(await service.summary(req.query || {}));
      if (req.method === 'POST') {
        const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'anon').split(',')[0].trim();
        return res.status(200).json(await service.submit(jsonBody(req), { ip }));
      }
      res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'GET or POST only' });
    } catch (error) { return publicError(res, error, 'event-response'); }
  };
}
export default rsvpHandler();
