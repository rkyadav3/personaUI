import { useEffect, useRef, useState } from 'react';
export default function MainSitePreview({ settings }) {
  const frame = useRef(null), latest = useRef(settings), [width, setWidth] = useState('desktop');
  latest.current = settings;
  const send = () => frame.current?.contentWindow?.postMessage({ type: 'persona-home-draft', settings: latest.current }, window.location.origin);
  useEffect(() => { send(); }, [settings]);
  useEffect(() => {
    const ready = event => { if (event.origin === window.location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'persona-home-ready') send(); };
    window.addEventListener('message', ready); return () => window.removeEventListener('message', ready);
  }, []);
  return <section className="main-site-preview"><div className="head"><div><h2>Live main site preview</h2><p className="muted">Unsaved changes appear here immediately, using the current public profiles.</p></div><div className="row"><button type="button" className="btn small" aria-pressed={width === 'desktop'} onClick={() => setWidth('desktop')}>Desktop</button><button type="button" className="btn small" aria-pressed={width === 'mobile'} onClick={() => setWidth('mobile')}>Mobile</button></div></div><div className="main-site-preview-scroll"><iframe ref={frame} title="Live main site preview" src="/?preview=main-site" onLoad={send} style={{ width: width === 'mobile' ? 390 : 1100 }} /></div></section>;
}
