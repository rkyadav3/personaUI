import 'open-glass-ui/styles.css';
import { Button, FileDropzone, Glass, GlassSystemProvider, SegmentedControl, Slider, Switch } from 'open-glass-ui';
import { useEffect, useRef, useState } from 'react';
import { BG_BUCKET, BG_DEFAULTS, normalizeBg } from '../../shared/siteSettings.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { prepareImage } from '../lib/image.js';
import { uploadToSigned } from '../lib/storage.js';
import BackgroundLayer from '../components/BackgroundLayer.jsx';

const STAGE_BG = { blur: 22, dim: 38, brightness: 90, zoom: 1, parallax: false };   // soft backdrop so the glass panel stays readable
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
    <GlassSystemProvider renderer="auto" theme={{ appearance: 'dark' }}>
      <h1>Settings</h1>
      <p className="muted">Make your page feel like your own AI. Pick a picture, then adjust how it sits behind the chat. Visitors of your page see exactly what the preview shows.</p>
      <div className="settings-stage">
        {previewUrl ? <BackgroundLayer imageUrl={previewUrl} bg={STAGE_BG} /> : <div className="stage-fallback" />}

        <Glass as="aside" material="frosted" className="settings-panel" aria-label="Background controls">
          <h2>Background image</h2>
          <FileDropzone label={previewUrl ? 'Drop a different picture, or choose one' : 'Drop a picture here, or choose one'} accept="image/jpeg,image/png,image/webp" maxSizeBytes={25 * 1024 * 1024}
            onFiles={choose} onRejected={() => setMsg({ kind: 'error', t: 'That file is too large (25 MB max).' })} />
          {previewUrl && <div className="row" style={{ marginTop: 8 }}>
            <Button variant="quiet" size="small" onClick={() => { setPending(null); setRemoved(true); }}>Remove image</Button>
          </div>}
          <p className="hint">Pictures are shrunk to 2200 px and stripped of hidden photo data (like location) before upload.</p>

          <h3>Adjust</h3>
          <Slider label="Zoom" min={1} max={3} step={0.05} value={bg.zoom} valueText={`${bg.zoom.toFixed(2)}×`} onChange={num(v => set({ zoom: v }))} />
          <Slider label="Focus left to right" min={0} max={100} value={bg.x} valueText={`${Math.round(bg.x)}%`} onChange={num(v => set({ x: v }))} />
          <Slider label="Focus top to bottom" min={0} max={100} value={bg.y} valueText={`${Math.round(bg.y)}%`} onChange={num(v => set({ y: v }))} />
          <Slider label="Blur" min={0} max={24} value={bg.blur} valueText={`${bg.blur}px`} onChange={num(v => set({ blur: v }))} />
          <Slider label="Brightness" min={30} max={140} value={bg.brightness} valueText={`${bg.brightness}%`} onChange={num(v => set({ brightness: v }))} />
          <Slider label="Dark overlay (keeps text readable)" min={0} max={85} value={bg.dim} valueText={`${bg.dim}%`} onChange={num(v => set({ dim: v }))} />

          <h3>Behaviour</h3>
          <Switch label="Subtle movement with the pointer" description="Turned off automatically for people who prefer reduced motion." checked={bg.parallax} onCheckedChange={v => set({ parallax: v })} />
          <Switch label="Show the glowing ball" checked={bg.ball} onCheckedChange={v => set({ ball: v })} />
          {bg.ball && <Slider label="Ball strength" min={20} max={100} value={bg.ballOpacity} valueText={`${bg.ballOpacity}%`} onChange={num(v => set({ ballOpacity: v }))} />}

          <div className="row" style={{ marginTop: 14 }}>
            <Button variant="primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setBg({ ...BG_DEFAULTS })}>Reset adjustments</Button>
          </div>
          {msg && <p className={`panel-msg ${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.t}</p>}
          {dirty && !msg && <p className="hint">You have unsaved changes.</p>}
        </Glass>

        <section className="preview-wrap" aria-label="Preview">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <SegmentedControl aria-label="Preview size" value={device} onValueChange={setDevice} items={[{ value: 'desktop', label: 'Desktop' }, { value: 'phone', label: 'Phone' }]} />
            {user?.slug && <Button variant="quiet" size="small" onClick={() => window.open(`/u/${user.slug}`, '_blank', 'noopener')}>Open my page</Button>}
          </div>
          <div className={`preview ${device}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ cursor: previewUrl ? 'grab' : 'default' }}>
            <div className="preview-bg">
              {previewUrl ? <BackgroundLayer imageUrl={previewUrl} bg={{ ...bg, parallax: false }} /> : <div className="stage-fallback dark" />}
            </div>
            {bg.ball && <div className="mini-ball" style={{ opacity: bg.ballOpacity / 100 }} />}
            <div className="mini-ui">
              <p>Hi. Ask me anything about my research.</p>
              <Glass as="div" material="regular" className="mini-input">Ask me anything about my research</Glass>
            </div>
          </div>
          <p className="hint">{previewUrl ? 'Drag the preview to move the picture.' : 'No picture yet. Your page uses the plain dark background.'}</p>
        </section>
      </div>
    </GlassSystemProvider>
  );
}
