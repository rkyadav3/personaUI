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
window.fetch = (url, options) => {
  if (url === '/api/chat') return Promise.resolve(new Response(JSON.stringify({ reply: `Reply to: ${JSON.parse(options.body).message}`, sources: ['Published notes'] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  if (url === '/api/track') return Promise.resolve(new Response(JSON.stringify({ avg: 4.8, count: 5 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  return originalFetch(url, options);
};
const productData = params.get('products') === '1' ? { purpose: 'Designer sharing practical tools and guides for thoughtful products.', contributions: [{ category: 'Books', offerings: [
  { id: 'fixture-guide', title: 'Free design guide', description: 'A practical guide to making your next product easier to use.', pricing: 'free', views: 20, clicks: 2, accessReady: true },
  { id: 'fixture-course', title: 'Popular paid course', description: 'Learn the design process from discovery to a polished launch.', pricing: 'paid', price: 499, currency: 'INR', views: 10, clicks: 12, accessReady: true, ratingAvg: 4.8, ratingCount: 5 },
  { id: 'fixture-kit', title: 'Starter toolkit', description: 'Templates and checklists for your next project.', pricing: 'free', views: 3, clicks: 1, accessReady: true },
  { id: 'fixture-fourth', title: 'Fourth product', pricing: 'free', views: 1, clicks: 0, accessReady: true },
] }] } : {};
const view = params.get('mode') === 'admin'
  ? <div className="studio-overview" style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}><StudioAssistant user={{ id: 'fixture-owner' }} call={call} /></div>
  : <PortfolioSite data={{ name: 'Ravi', expertise: ['Design'], ...productData, page: { chat: { mic: false }, glass: { on: false }, layout: { sidebar: params.get('sidebar') === 'left' ? 'left' : 'right' } } }} slug="fixture-ravi" sub="chat" />;
createRoot(document.getElementById('root')).render(<MemoryRouter>{view}</MemoryRouter>);
