// Browser regression fixture: real components with local, owner-scoped mock API responses.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import StudioAssistant from '../../src/components/StudioAssistant.jsx';
import PortfolioSite from '../../src/components/portfolio/PortfolioSite.jsx';
import '../../src/styles.css';
import '../../src/styles/studio.css';

const params = new URLSearchParams(location.search);
const storageKey = 'test:studio-history';
const initial = Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1), question: `Saved question ${i + 1}`, answer: `Saved answer ${i + 1}`, createdAt: '2026-11-05T10:00:00Z', reviewId: null }));
const read = () => JSON.parse(sessionStorage.getItem(storageKey) || JSON.stringify(initial));
async function call(op, args) {
  if (op === 'studio.history') {
    const rows = read().filter(turn => !args.before || Number(turn.id) < Number(args.before)).reverse();
    return { rows: rows.slice(0, 25), nextBefore: rows.length > 25 ? rows[24].id : null };
  }
  if (op === 'studio.prepare') {
    const rows = read(), turn = { id: String(Number(rows.at(-1)?.id || 0) + 1), question: args.message, answer: `Reply to: ${args.message}`, createdAt: new Date().toISOString(), reviewId: null };
    sessionStorage.setItem(storageKey, JSON.stringify([...rows, turn]));
    return { answer: turn.answer, review: null, turn };
  }
  throw new Error('Unexpected test operation');
}
const originalFetch = window.fetch;
window.fetch = (url, options) => url === '/api/chat' ? Promise.resolve(new Response(JSON.stringify({ reply: `Reply to: ${JSON.parse(options.body).message}`, sources: ['Published notes'] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) : originalFetch(url, options);
const view = params.get('mode') === 'admin'
  ? <div className="studio-overview" style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}><StudioAssistant user={{ id: 'fixture-owner' }} call={call} /></div>
  : <PortfolioSite data={{ name: 'Ravi', expertise: ['Design'], page: { chat: { mic: false }, glass: { on: false } } }} slug="fixture-ravi" sub="chat" />;
createRoot(document.getElementById('root')).render(<MemoryRouter>{view}</MemoryRouter>);
