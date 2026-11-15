import { createIntegrationService } from './integrations.js';
import { HttpError, jsonBody, publicError } from './http.js';
import { workspaceEnabled } from './workspaceVisibility.js';

export function createPersonaHandler({ service = createIntegrationService(), enabled = () => true } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Allow', 'POST');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    try {
      if (!enabled()) throw new HttpError(503, 'Website integration is not enabled yet.');
      const access = await service.authenticate(req), body = jsonBody(req, 8000);
      if (body.op === 'session') return res.status(200).json(await service.session(access));
      if (body.op && body.op !== 'chat') throw new HttpError(400, 'Choose chat or session.');
      const result = await service.chat(access, { message: body.message, requestId: body.requestId, sessionId: body.sessionId });
      return res.status(200).json(result);
    } catch (error) {
      if ([401, 403, 429].includes(error.status) && service.recordRejection) {
        try { await service.recordRejection(error.status); } catch { console.error('persona-api rejection telemetry unavailable'); }
      }
      if ([409, 429].includes(error.status)) res.setHeader('Retry-After', error.status === 409 ? '2' : '60');
      return publicError(res, error, 'persona-api');
    }
  };
}
export default createPersonaHandler({ enabled: workspaceEnabled });

