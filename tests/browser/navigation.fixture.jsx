import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import PortfolioSite from '../../src/components/portfolio/PortfolioSite.jsx';
import '../../src/styles.css';

// Local published content; no requests reach real profiles or payment services.
const data = { name: 'Ravi', expertise: ['Product design', 'Research'], purpose: 'I build thoughtful products and share what I learn.',
  portfolio: {
    projects: [{ title: 'Community workspace', tag: 'Product design', summary: 'A shared workspace built around how people collaborate.', description: 'Research and accessible design shaped this project.' }],
    talks: [{ title: 'Designing with clarity', event: 'Design community', summary: 'Practical ways to make products easier to understand.' }],
    awards: [{ title: 'Design award', sub: 'Community choice' }],
    recognition: [{ kind: 'recognition', title: 'Community contributor', issuer: 'Design community' }],
    certificates: [{ title: 'Human-centred Design', issuer: 'Design Institute', date: 'November 2026', summary: 'Practical training in accessible product design.', url: 'https://example.test/certificate' }],
    testimonials: [{ author: 'Ananya', role: 'Product lead', quote: 'A thoughtful collaborator who made our product easier to use.' }],
    experience: [{ role: 'Designer', company: 'Independent', period: '2024 – Present' }],
  },
  updates: [{ id: 1, kind: 'update', title: 'New design notes', body: 'Sharing lessons from a recent project.' }],
};
window.fetch = async (url, options) => new Response(JSON.stringify(url === '/api/chat' ? { reply: `Reply to: ${JSON.parse(options.body).message}`, sources: ['Published notes'] } : { ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
function Page() {
  const { sub } = useParams();
  return <PortfolioSite data={data} slug="preview" sub={sub} />;
}
const params = new URLSearchParams(location.search);
data.contact = { email: 'owner@example.test', location: 'Bengaluru' };
data.page = { customization: { contactLayout: params.get('contactLayout') || 'centered', contactWidth: params.get('contactWidth') || 'wide', contactDetails: params.get('contactDetails') !== 'false' } };
const section = ['projects', 'events', 'talks', 'recognition', 'awards', 'certificates', 'testimonials', 'experience'].includes(params.get('section')) ? params.get('section') : 'projects';
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[params.get('view') === 'contact' ? '/p/preview/contact' : `/p/preview/activity?section=${section}`]}><Routes><Route path="/p/preview" element={<Page />} /><Route path="/p/preview/:sub" element={<Page />} /></Routes></MemoryRouter>);
