import 'open-glass-ui/styles.css';
import { Button, FileDropzone, GlassSystemProvider, Slider, Switch } from 'open-glass-ui';
import { useEffect, useRef, useState } from 'react';
import { BG_BUCKET, BG_DEFAULTS, normalizeBg } from '../../shared/siteSettings.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { prepareImage } from '../lib/image.js';
import { uploadToSigned } from '../lib/storage.js';
import BackgroundLayer from '../components/BackgroundLayer.jsx';

const num = fn => e => fn(Number(e.target.value));

export default function Settings() {
  const { user } = useAuth();
  const [saved, setSaved] = useState(null), [bg, setBg] = useState(normalizeBg()), [pending, setPending] = useState(null), [removed, setRemoved] = useState(false);
  const [device, setDevice] = useState('desktop'), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const drag = useRef(null);

  useEffect(() => { api('site.get').then(s => { setSaved(s); setBg(s.bg); }, e => setMsg({ kind: 'error', t: e.message })); }, []);
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);

  if (!saved) return <p className="muted">{msg ? msg.t : 'Loading…'}</p>;
  const previewUrl = removed ? null : pending?.url || saved.imageUrl;
  const dirty = !!pending || removed || JSON.stringify(bg) !== JSON.stringify(saved.bg);
  const set = patch => setBg(b => ({ ...b, ...patch }));

  async function choose(files) {
    setMsg(null);
    try { const p = await prepareImage(files[0]); setPending({ ...p, url: URL.createObjectURL(p.blob) }); setRemoved(false); set({ x: 50, y: 50, zoom: 1 }); }
    catch (e) { setMsg({ kind: 'error', t: e.message }); }
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      let path;                                                     // undefined = keep the current image
      if (pending) { const s = await api('site.sign', { type: pending.type }); await uploadToSigned(s.path, s.token, pending.blob, BG_BUCKET); path = s.path; }
      else if (removed) path = null;
      const r = await api('site.save', { bg, path });
      setSaved(r); setBg(r.bg); setPending(null); setRemoved(false);
      setMsg({ kind: 'success', t: 'Saved. Your page now looks like this.' });
    } catch (e) { setMsg({ kind: 'error', t: e.message }); }
    setBusy(false);
  }

  // dragging the preview pans the picture
  const down = e => { if (!previewUrl) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, bx: bg.x, by: bg.y }; };
  const move = e => {
    const d = drag.current; if (!d) return;
    const r = e.currentTarget.getBoundingClientRect();
    set({ x: Math.min(100, Math.max(0, d.bx - (e.clientX - d.x) / r.width * 100)), y: Math.min(100, Math.max(0, d.by - (e.clientY - d.y) / r.height * 100)) });
  };
  const up = () => { drag.current = null; };

  return (
    <>
      <div className="head" style={{ marginBottom: 8 }}>
        <div>
          <h1>Persona Appearance</h1>
          <p className="muted" style={{ margin: 0 }}>
            Design how your public AI page looks. Changes are previewed live — visitors see exactly what you see here.
          </p>
        </div>
      </div>

      <div className="ux-guide-banner" style={{ marginBottom: 22 }}>
        <div className="ux-guide-icon">🎨</div>
        <div className="ux-guide-content">
          <h4>What does this control?</h4>
          <p>
            This sets the background image, blur, brightness, and glowing ball for your public Persona page at <code>/p/your-slug</code>.
            Use the live preview on the right to dial in the exact look you want before saving.
          </p>
        </div>
      </div>

      <div className="settings-stage">
        <GlassSystemProvider renderer="auto" theme={{ appearance: 'light', theme: { preset: 'violet' } }}>
          <aside className="settings-panel" aria-label="Background controls">
            <h2 style={{ marginBottom: 4 }}>🖼️ Background Image</h2>
            <p className="hint" style={{ marginBottom: 12 }}>
              Drag and drop an image, or click to choose. It becomes the atmospheric backdrop behind your AI chat interface.
            </p>
            <FileDropzone
              label={previewUrl ? 'Drop a different picture, or choose one' : 'Drop a picture here, or choose one'}
              accept="image/jpeg,image/png,image/webp"
              maxSizeBytes={25 * 1024 * 1024}
              onFiles={choose}
              onRejected={() => setMsg({ kind: 'error', t: 'That file is too large (25 MB max).' })}
            />
            {previewUrl && (
              <div className="row" style={{ marginTop: 8 }}>
                <Button variant="quiet" size="small" onClick={() => { setPending(null); setRemoved(true); }}>
                  🗑️ Remove image
                </Button>
              </div>
            )}
            <p className="hint" style={{ marginTop: 6 }}>
              Images are automatically resized to 2200px max and EXIF data (including GPS location) is stripped before upload.
            </p>

            <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '18px 0' }} />

            <h3 style={{ marginBottom: 10 }}>⚙️ Image Adjustments</h3>
            <div className="ux-step-cards" style={{ marginBottom: 14 }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px', fontSize: '.82rem', color: '#475569' }}>
                <strong style={{ display: 'block', color: '#0f172a', marginBottom: 2 }}>💡 Tip</strong>
                Drag the live preview to reposition the image focus point interactively.
              </div>
            </div>
            <Slider label="Zoom" min={1} max={3} step={0.05} value={bg.zoom} valueText={`${bg.zoom.toFixed(2)}×`} onChange={num(v => set({ zoom: v }))} />
            <Slider label="Focus — Left to Right" min={0} max={100} value={bg.x} valueText={`${Math.round(bg.x)}%`} onChange={num(v => set({ x: v }))} />
            <Slider label="Focus — Top to Bottom" min={0} max={100} value={bg.y} valueText={`${Math.round(bg.y)}%`} onChange={num(v => set({ y: v }))} />
            <Slider label="Blur (soften background)" min={0} max={24} value={bg.blur} valueText={`${bg.blur}px`} onChange={num(v => set({ blur: v }))} />
            <Slider label="Brightness" min={30} max={140} value={bg.brightness} valueText={`${bg.brightness}%`} onChange={num(v => set({ brightness: v }))} />
            <Slider label="Dark Overlay (improves text readability)" min={0} max={85} value={bg.dim} valueText={`${bg.dim}%`} onChange={num(v => set({ dim: v }))} />

            <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '18px 0' }} />

            <h3 style={{ marginBottom: 10 }}>✨ Effects & Behaviour</h3>
            <Switch
              label="Subtle parallax movement"
              description="Background shifts subtly as the visitor moves their pointer. Auto-disabled for reduced-motion users."
              checked={bg.parallax}
              onCheckedChange={v => set({ parallax: v })}
            />
            <Switch
              label="Show glowing 3D sphere"
              description="Displays the animated AI orb on your public persona page."
              checked={bg.ball}
              onCheckedChange={v => set({ ball: v })}
            />
            {bg.ball && (
              <Slider label="Sphere glow intensity" min={20} max={100} value={bg.ballOpacity} valueText={`${bg.ballOpacity}%`} onChange={num(v => set({ ballOpacity: v }))} />
            )}

            <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '18px 0' }} />

            <div className="row" style={{ gap: 10 }}>
              <Button variant="primary" disabled={!dirty || busy} onClick={save}>
                {busy ? 'Saving…' : '💾 Save Appearance'}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setBg({ ...BG_DEFAULTS })}>
                Reset to Defaults
              </Button>
            </div>
            {msg && (
              <p className={`panel-msg ${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'}>
                {msg.t}
              </p>
            )}
            {dirty && !msg && <p className="hint" style={{ marginTop: 10 }}>⚠️ You have unsaved changes.</p>}
          </aside>
        </GlassSystemProvider>

        <section className="preview-wrap" aria-label="Live Preview">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14, width: '100%' }}>
            <div>
              <strong style={{ fontSize: '.92rem', color: '#0f172a' }}>Live Preview</strong>
              <p className="hint" style={{ margin: '2px 0 0' }}>
                {previewUrl ? 'Drag image to reposition focus.' : 'No image yet — dark background mode.'}
              </p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                className={`page-tab-btn ${device === 'desktop' ? 'active' : ''}`}
                onClick={() => setDevice('desktop')}
                style={{ padding: '6px 14px', fontSize: '.84rem' }}
              >
                🖥️ Desktop
              </button>
              <button
                className={`page-tab-btn ${device === 'phone' ? 'active' : ''}`}
                onClick={() => setDevice('phone')}
                style={{ padding: '6px 14px', fontSize: '.84rem' }}
              >
                📱 Mobile
              </button>
              {user?.slug && (
                <a
                  className="btn"
                  href={`/u/${user.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '.84rem', padding: '6px 14px' }}
                >
                  Open Live ↗
                </a>
              )}
            </div>
          </div>

          <div
            className={`preview ${device}`}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            style={{ cursor: previewUrl ? 'grab' : 'default', width: '100%', maxWidth: device === 'phone' ? 280 : '100%' }}
          >
            <div className="preview-bg">
              {previewUrl
                ? <BackgroundLayer imageUrl={previewUrl} bg={{ ...bg, parallax: false }} />
                : <div className="stage-fallback dark" />
              }
            </div>
            {bg.ball && <div className="mini-ball" style={{ opacity: bg.ballOpacity / 100 }} />}
            <div className="mini-ui">
              <p>Hi. Ask me anything about me.</p>
              <div className="mini-input">Ask me anything…</div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
