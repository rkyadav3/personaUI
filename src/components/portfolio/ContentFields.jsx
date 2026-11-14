import { Link } from 'react-router-dom';
import { Field } from '../Ui.jsx';
import { Txt, Repeater } from './EditorFields.jsx';
import MediaUpload from '../MediaUpload.jsx';
import { ICON_NAMES, PRODUCT_STATUS, normalizePortfolio } from '../../../shared/portfolio.js';
import { CHECKOUT_CURRENCIES, MAX_QUANTITY } from '../../../shared/commerce.js';
const recordRequirements = { awards: 'Add at least one award line.', experience: 'Add a role or company.', testimonials: 'Add the author name and testimonial.' };
const validateRecord = collection => record => normalizePortfolio({ [collection]: [record] })[collection].length ? '' : recordRequirements[collection] || 'Add a name or title before adding this entry.';
export default function ContentFields({ tab, pf, set }) { return <>
{tab === 'awards' && <>            <section className="card"><h3>Awards &amp; recognition (up to 3)</h3>
              <Repeater validate={validateRecord('awards')} items={pf.awards} onChange={awards => set({ awards })} blank={{ title: '', sub: '' }} max={3} noun="Award" title={a => a.title || a.sub || 'New award'}>
                {(a, p) => <div className="cols c2"><Txt label="Small line" value={a.title} max={50} ph="IIT Project Expo 3.0" onChange={v => p({ title: v })} /><Txt label="Main line" value={a.sub} max={60} ph="3rd Prize — VisionSwitch" onChange={v => p({ sub: v })} /></div>}
              </Repeater>
            </section>
</>}
          {tab === 'projects' && <>
            
            <section className="card"><h3>Projects</h3>
              <Repeater validate={validateRecord('projects')} items={pf.projects} onChange={projects => { const featured = projects.findLast(value => value.featured && !pf.projects.includes(value)); set({ projects: featured ? projects.map(value => ({ ...value, featured: value === featured })) : projects }); }} blank={{ title: '' }} max={24} noun="Project" title={x => x.title || 'New project'}>
                {(x, p) => <>
                  <Txt label="Title" value={x.title} max={80} ph="VisionSwitch" onChange={v => p({ title: v })} />
                  <div className="cols c2"><Txt label="Category tag" value={x.tag} max={40} ph="IoT + Computer Vision" onChange={v => p({ tag: v })} /><Txt label="Year" value={x.year} max={10} ph="2025" onChange={v => p({ year: v })} /></div>
                  <Txt label="One-line summary" value={x.summary} max={240} rows={2} onChange={v => p({ summary: v })} />
                  <Txt label="Full description (opens in a pop-up; blank line = new paragraph)" value={x.description} max={1600} rows={4} onChange={v => p({ description: v })} />
                  <Txt label="Picture link (https://…)" value={x.image} ph="https://…/screenshot.png" onChange={v => p({ image: v })} />
                  <Txt label="Technologies (comma separated)" value={x.tech} max={160} ph="React, Arduino, OpenCV" onChange={v => p({ tech: v })} />
                  <div className="cols c2"><Txt label="Award line" value={x.award} max={60} ph="3rd Prize — PROJECT EXPO 3.0" onChange={v => p({ award: v })} /><Txt label="Award detail" value={x.awardSub} max={60} ph="Manipal University Jaipur" onChange={v => p({ awardSub: v })} /></div>
                  <div className="cols c2"><Txt label="Main link" value={x.demoUrl} ph="https://…" onChange={v => p({ demoUrl: v })} /><Txt label="Main button text" value={x.demoLabel} max={24} ph="View Project" onChange={v => p({ demoLabel: v })} /></div>
                  <div className="cols c2"><Txt label="Code link" value={x.repoUrl} ph="https://github.com/…" onChange={v => p({ repoUrl: v })} /><Txt label="Code button text" value={x.repoLabel} max={24} ph="Github" onChange={v => p({ repoLabel: v })} /></div>
                  <label className="toggle"><input type="checkbox" checked={!!x.featured} onChange={e => p({ featured: e.target.checked })} /> Feature this one big on the home page</label>
                </>}
              </Repeater>
            </section>
          </>}

          {tab === 'products' && <>
            
            <section className="card"><h3>Products &amp; initiatives</h3>
              <Repeater validate={validateRecord('products')} items={pf.products} onChange={products => set({ products })} blank={{ id: '', title: '', pricing: 'free', amount: 0, currency: 'INR', deliveryUrl: '' }} max={24} noun="Product" title={x => x.title || 'New product'}>
                {(x, p) => <>
                  <Txt label="Name" value={x.title} max={80} ph="Attendance System" onChange={v => p({ title: v })} />
                  <Txt label="Description" value={x.summary} max={240} rows={2} ph="RFID + Face Recognition + IoT Integration" onChange={v => p({ summary: v })} />
                  <div className="cols c2"><Field label="Status"><select value={x.status || ''} onChange={e => p({ status: e.target.value })}>{PRODUCT_STATUS.map(s => <option key={s} value={s}>{s || 'None'}</option>)}</select></Field>
                    <Field label="Icon"><select value={x.icon || ''} onChange={e => p({ icon: e.target.value })}><option value="">Automatic</option>{ICON_NAMES.map(n => <option key={n} value={n}>{n}</option>)}</select></Field></div>
                  <Field label="Free or paid"><select value={x.pricing || 'unspecified'} onChange={e => p({ pricing: e.target.value, price: '' })}><option value="free">Free</option><option value="paid">Paid</option><option value="unspecified">Information only</option></select></Field>
                  <Field label="Available quantity (optional)"><input aria-label="Available quantity (optional)" type="number" min={0} max={MAX_QUANTITY} step={1} value={x.quantity ?? ''} placeholder="Unlimited" onChange={e => p({ quantity: e.target.value })} /><span className="hint">Leave blank for unlimited stock or slots. Zero means sold out.</span></Field>
                  {x.pricing === 'paid' && <div className="cols c2"><Field label="Price"><input type="number" min={0.01} max={9999999.99} step="0.01" value={x.amount ?? ''} onChange={e => p({ amount: e.target.value, price: '' })} /></Field>
                    <Field label="Currency"><select value={x.currency || 'INR'} onChange={e => p({ currency: e.target.value })}>{CHECKOUT_CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></Field></div>}
                  {['free', 'paid'].includes(x.pricing) && <MediaUpload purpose="delivery" label="Private delivery file" value={x.assetId} onChange={assetId => p({ assetId, deliveryUrl: '' })} />}
                  <Txt label="Picture link" value={x.image} ph="https://…" onChange={v => p({ image: v })} />
                  <div className="cols c2"><Txt label="Public details link" value={x.url} ph="https://…" onChange={v => p({ url: v })} /><Txt label="Details button text" value={x.linkLabel} max={24} ph="More details" onChange={v => p({ linkLabel: v })} /></div>
                </>}
              </Repeater>
            </section>
          </>}

          {tab === 'experience' && (
            <section className="card"><h3>Experience timeline</h3>
              <p className="hint">Empty = the employers from Profile &amp; Offerings. Education always comes from there.</p>
              <Repeater validate={validateRecord('experience')} items={pf.experience} onChange={experience => set({ experience })} blank={{ role: '', company: '' }} max={20} noun="Role" title={e => [e.role, e.company].filter(Boolean).join(' · ') || 'New role'}>
                {(e, p) => <>
                  <div className="cols c2"><Txt label="Role" value={e.role} max={80} ph="Founder" onChange={v => p({ role: v })} /><Txt label="Company" value={e.company} max={80} ph="Equilx Corporation" onChange={v => p({ company: v })} /></div>
                  <Txt label="Period" value={e.period} max={40} ph="2023 – Present" onChange={v => p({ period: v })} />
                  <Txt label="What you did" value={e.summary} max={500} rows={3} onChange={v => p({ summary: v })} />
                </>}
              </Repeater>
            </section>
          )}

          {tab === 'talks' && (
            <section className="card"><h3>Talks, podcasts &amp; interviews</h3>
              <p className="hint">Your “Talk Shows” offerings also appear here, under Activity → Talks.</p>
              <Repeater validate={validateRecord('talks')} items={pf.talks} onChange={talks => set({ talks })} blank={{ title: '' }} max={24} noun="Talk" title={t => t.title || 'New talk'}>
                {(t, p) => <>
                  <Txt label="Title" value={t.title} max={100} onChange={v => p({ title: v })} />
                  <div className="cols c2"><Txt label="Event or show" value={t.event} max={100} onChange={v => p({ event: v })} /><Txt label="Date" value={t.date} max={30} ph="March 2025" onChange={v => p({ date: v })} /></div>
                  <Txt label="Short note" value={t.summary} max={300} rows={2} onChange={v => p({ summary: v })} />
                  <Txt label="Link (video / article)" value={t.url} ph="https://…" onChange={v => p({ url: v })} />
                </>}
              </Repeater>
            </section>
          )}

          {['recognition', 'certificates'].includes(tab) && <section className="card"><h3>{tab === 'recognition' ? 'Recognition & awards' : 'Certificates'}</h3>
            <p className="hint">These entries are published on your Activity page. Awards highlighted on Home also appear under Activity → Awards.</p>
            <Repeater validate={validateRecord(tab)} items={pf[tab]} onChange={items => set({ [tab]: items })} blank={{ title: '', ...(tab === 'recognition' ? { kind: 'recognition' } : {}) }} max={24} noun={tab === 'recognition' ? 'Recognition' : 'Certificate'} title={item => item.title || 'New entry'}>
              {(item, patch) => <>
                {tab === 'recognition' && <Field label="Type"><select value={item.kind} onChange={e => patch({ kind: e.target.value })}><option value="recognition">Recognition</option><option value="award">Award</option></select></Field>}
                <Txt label="Title" value={item.title} max={100} onChange={v => patch({ title: v })} />
                <div className="cols c2"><Txt label="Issued by" value={item.issuer} max={100} onChange={v => patch({ issuer: v })} /><Txt label="Date" value={item.date} max={30} onChange={v => patch({ date: v })} /></div>
                <Txt label="Description" value={item.summary} max={500} rows={3} onChange={v => patch({ summary: v })} />
                <Txt label={tab === 'certificates' ? 'Certificate link' : 'Source link'} value={item.url} ph="https://…" onChange={v => patch({ url: v })} />
              </>}
            </Repeater>
          </section>}

          {tab === 'testimonials' && <section className="card"><h3>Testimonials</h3>
            <p className="hint">Publish testimonials you have permission to share under Activity → Testimonials.</p>
            <Repeater validate={validateRecord('testimonials')} items={pf.testimonials} onChange={testimonials => set({ testimonials })} blank={{ author: '', quote: '' }} max={24} noun="Testimonial" title={item => item.author || 'New testimonial'}>
              {(item, patch) => <><Txt label="Name" value={item.author} max={100} onChange={v => patch({ author: v })} /><Txt label="Role or organisation" value={item.role} max={100} onChange={v => patch({ role: v })} /><Txt label="Testimonial" value={item.quote} max={1200} rows={5} onChange={v => patch({ quote: v })} /><Txt label="Source link" value={item.url} ph="https://…" onChange={v => patch({ url: v })} /></>}
            </Repeater>
          </section>}

</>; }
