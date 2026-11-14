import { Link } from 'react-router-dom';
import { ACCENTS, BG_MODES, FONTS, SECTION_LABELS } from '../../../shared/pageSettings.js';
import { CATEGORIES } from '../../../shared/profileSchema.js';
import { Field } from '../Ui.jsx';

const Range = ({ label, value, onChange, min, max, step = 1, unit = '' }) => <Field label={`${label}: ${value}${unit}`}><input type="range" value={value} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} /></Field>;
const Text = ({ label, value, onChange, max = 120, rows, placeholder }) => <Field label={label}>{rows ? <textarea rows={rows} value={value} maxLength={max} placeholder={placeholder} onChange={event => onChange(event.target.value)} /> : <input value={value} maxLength={max} placeholder={placeholder} onChange={event => onChange(event.target.value)} />}</Field>;

export function LookControls({ page, setPage, imageUrl }) {
  const setIn = (key, patch) => setPage({ [key]: { ...page[key], ...patch } });
  return <>
    <section className="card"><h3>Portfolio appearance</h3>
      <Field label="Background style"><select value={page.theme.bg} onChange={event => setIn('theme', { bg: event.target.value })}>{Object.entries(BG_MODES).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field>
      {page.theme.bg === 'color' && <Field label="Background colour"><input type="color" value={page.theme.bgColor} onChange={event => setIn('theme', { bgColor: event.target.value })} /></Field>}
      {page.theme.bg === 'image' && <><Range label="Fade background towards white" min={0} max={95} value={page.theme.wash} unit="%" onChange={value => setIn('theme', { wash: value })} />{!imageUrl && <p className="hint">Add a background image under Chat in this editor.</p>}</>}
      <Field label="Font"><select value={page.theme.font} onChange={event => setIn('theme', { font: event.target.value })}>{Object.entries(FONTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      <Range label="Corner roundness" min={6} max={44} value={page.theme.radius} unit="px" onChange={value => setIn('theme', { radius: value })} />
      <Range label="Page width" min={1000} max={1700} step={20} value={page.theme.maxWidth} unit="px" onChange={value => setIn('theme', { maxWidth: value })} />
      <h4>Accent colour</h4>
      <div className="portfolio-swatches">{Object.entries(ACCENTS).map(([key, colours]) => <button key={key} type="button" aria-label={`Use ${key} accent`} aria-pressed={!page.accentHex && page.accent === key} onClick={() => setPage({ accent: key, accentHex: '' })} style={{ background: `linear-gradient(135deg,${colours[0]},${colours[1]})` }} />)}</div>
      <Field label="Custom accent colour"><input type="color" value={page.accentHex || ACCENTS[page.accent][0]} onChange={event => setPage({ accentHex: event.target.value })} /></Field>
    </section>
    <section className="card"><h3>Liquid glass</h3>
      <label className="toggle"><input type="checkbox" checked={page.glass.on} onChange={event => setIn('glass', { on: event.target.checked })} /> Use glass panels</label>
      <p className="hint">Adjust the panels on your portfolio and Chat page.</p>
      {page.glass.on && [['refraction', 'Edge refraction', 100], ['blur', 'Blur', 40], ['tint', 'Tint', 100], ['dispersion', 'Colour dispersion', 100], ['rim', 'Rim highlight', 100], ['shadow', 'Shadow', 100]].map(([key, label, max]) => <Range key={key} label={label} min={0} max={max} value={page.glass[key]} onChange={value => setIn('glass', { [key]: value })} />)}
    </section>
  </>;
}

export function StoreControls({ page, setPage }) {
  const setIn = (key, patch) => setPage({ [key]: { ...page[key], ...patch } });
  return <>
    <section className="card"><h3>Shop &amp; visible sections</h3>
      <Text label="Shop title" value={page.storeTitle} max={40} onChange={value => setPage({ storeTitle: value })} />
      <Text label="Shop subtitle" value={page.storeSubtitle} max={140} onChange={value => setPage({ storeSubtitle: value })} />
      <Range label="Items before Show more" min={2} max={40} value={page.storeLimit} onChange={value => setPage({ storeLimit: value })} />
      <label className="toggle"><input type="checkbox" checked={page.cart} onChange={event => setPage({ cart: event.target.checked })} />Enable checkout for Store items</label>
      <Text label="Currency for existing prices without one" value={page.currency} max={6} onChange={value => setPage({ currency: value })} />
      <p className="hint">Visible free and paid products appear on Home and Store. Manage prices and access links under <Link to="/admin/store?tab=categories">Offerings &amp; categories</Link> or <Link to="/admin/store?tab=products">Store products</Link>. Buyer records are under <Link to="/admin/purchases">Orders</Link>.</p>
      <div className="portfolio-checks">{Object.entries(SECTION_LABELS).map(([key, label]) => <label className="toggle" key={key}><input type="checkbox" checked={page.sections[key]} onChange={event => setIn('sections', { [key]: event.target.checked })} /> Show {label === 'Store' ? 'Shop' : label}</label>)}</div>
    </section>
    <section className="card"><h3>Offering categories</h3><p className="hint">Visible categories appear in the shop. You can also show them as questions in the Chat sidebar.</p>
      {CATEGORIES.map(category => <Field key={category} label={category}><select value={page.placement[category]} onChange={event => setIn('placement', { [category]: event.target.value })}><option value="store">Shop</option><option value="side">Shop + Chat sidebar</option><option value="hidden">Hidden</option></select></Field>)}
    </section>
  </>;
}

export function PersonaControls({ page, bg, setPage, setBg, imageUrl, onChooseBackground, onRemoveBackground }) {
  const setIn = (key, patch) => setPage({ [key]: { ...page[key], ...patch } });
  const patchChip = (index, patch) => setPage({ chips: page.chips.map((chip, number) => number === index ? { ...chip, ...patch } : chip) });
  return <>
    <section className="card"><h3>Chat greeting</h3>
      <Text label="Chat greeting" value={page.headline} max={60} placeholder="Chat with your name" onChange={value => setPage({ headline: value })} />
      <Text label="Highlighted words" value={page.headlineAccent} max={40} onChange={value => setPage({ headlineAccent: value })} />
      <Text label="Chat introduction" value={page.subtitle} max={220} rows={2} onChange={value => setPage({ subtitle: value })} />
      <Text label="Message box hint" value={page.placeholder} max={120} onChange={value => setPage({ placeholder: value })} />
      <div className="portfolio-checks"><label className="toggle"><input type="checkbox" checked={page.chat.mic} onChange={event => setIn('chat', { mic: event.target.checked })} /> Microphone (where supported)</label>
        <label className="toggle"><input type="checkbox" checked={page.chat.sources} onChange={event => setIn('chat', { sources: event.target.checked })} /> Show answer sources</label></div>
      <p className="hint">Your persona answers from published knowledge. Add and sync it in <Link to="/admin/knowledge">Knowledge Base</Link>.</p>
    </section>
    <section className="card"><h3>Suggested questions</h3><p className="hint">Leave this empty to use questions based on your published profile.</p>
      {page.chips.map((chip, index) => <div className="portfolio-question" key={index}><Text label={`Button ${index + 1}`} value={chip.label} max={32} onChange={value => patchChip(index, { label: value })} /><Text label="Question asked" value={chip.prompt} max={200} onChange={value => patchChip(index, { prompt: value })} /><button type="button" className="btn small danger" onClick={() => setPage({ chips: page.chips.filter((_, number) => number !== index) })}>Remove question</button></div>)}
      <button type="button" className="btn" disabled={page.chips.length >= 6} onClick={() => setPage({ chips: [...page.chips, { label: '', prompt: '' }] })}>+ Add question</button>
    </section>
    <section className="card"><h3>Chat profile card</h3>
      <Text label="Profile tagline" value={page.tagline} max={120} onChange={value => setPage({ tagline: value })} />
      <Text label="Profile introduction" value={page.about} max={600} rows={3} onChange={value => setPage({ about: value })} />
      <Text label="Portfolio button label" value={page.openLabel} max={24} onChange={value => setPage({ openLabel: value })} />
      <Field label="Chat sidebar position"><select value={page.layout.sidebar} onChange={event => setIn('layout', { sidebar: event.target.value })}><option value="right">Right</option><option value="left">Left</option></select></Field>
      <Field label="Chat portrait position"><select value={page.layout.photo} onChange={event => setIn('layout', { photo: event.target.value })}><option value="left">Left</option><option value="right">Right</option><option value="none">Hidden</option></select></Field>
    </section>
    <section className="card"><h3>Persona sphere</h3>
      <label className="toggle"><input type="checkbox" checked={page.ball.show && bg.ball} onChange={event => { setIn('ball', { show: event.target.checked }); setBg({ ball: event.target.checked }); }} /> Show glowing sphere in Chat</label>
      {page.ball.show && bg.ball && <><Range label="Sphere size" min={140} max={320} value={page.ball.size} unit="px" onChange={value => setIn('ball', { size: value })} /><Range label="Sphere glow intensity" min={20} max={100} value={bg.ballOpacity} unit="%" onChange={value => setBg({ ballOpacity: value })} /></>}
    </section>
    <section className="card"><h3>Background image</h3><p className="hint">Use this image across your public pages by choosing My background image under Appearance.</p>
      <Field label="Upload background image"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => onChooseBackground(event.target.files[0])} /></Field>
      <Text label="Background image link" value={bg.imageUrl} max={600} onChange={imageUrl => setBg({ imageUrl })} />
      {imageUrl && <><img className="portfolio-bg-thumbnail" src={imageUrl} alt="Current background" /><button type="button" className="btn small" onClick={onRemoveBackground}>Remove background image</button></>}
      {[['zoom', 'Background zoom', 1, 3, 0.05, '×'], ['x', 'Focus left to right', 0, 100, 1, '%'], ['y', 'Focus top to bottom', 0, 100, 1, '%'], ['blur', 'Background blur', 0, 24, 1, 'px'], ['brightness', 'Brightness', 30, 140, 1, '%'], ['dim', 'Dark overlay', 0, 85, 1, '%']].map(([key, label, min, max, step, unit]) => <Range key={key} label={label} min={min} max={max} step={step} unit={unit} value={bg[key]} onChange={value => setBg({ [key]: value })} />)}
      <label className="toggle"><input type="checkbox" checked={bg.parallax} onChange={event => setBg({ parallax: event.target.checked })} /> Subtle background parallax</label>
      <p className="hint">Images are resized and metadata is removed before upload. Parallax respects reduced motion preferences.</p>
    </section>
  </>;
}
