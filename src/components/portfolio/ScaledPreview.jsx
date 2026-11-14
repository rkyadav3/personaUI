import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A separate viewport makes the page's real media queries apply to the preview.
export default function ScaledPreview({ children, mobile = false }) {
  const width = mobile ? 390 : 1320;
  const box = useRef(null), frame = useRef(null);
  const [body, setBody] = useState(null), [scale, setScale] = useState(.5), [height, setHeight] = useState(900);
  useLayoutEffect(() => {
    const fit = () => { if (box.current) setScale(Math.min(1, box.current.clientWidth / width)); };
    fit(); const observer = new ResizeObserver(fit); observer.observe(box.current); return () => observer.disconnect();
  }, [width]);
  useEffect(() => {
    if (!body) return;
    const observer = new ResizeObserver(() => { const content = body.firstElementChild; if (content) setHeight(Math.max(400, content.scrollHeight)); });
    observer.observe(body); if (body.firstElementChild) observer.observe(body.firstElementChild);
    return () => observer.disconnect();
  }, [body]);
  function loaded() {
    const document = frame.current?.contentDocument;
    if (!document) return;
    document.head.replaceChildren();
    for (const style of window.document.querySelectorAll('style,link[rel="stylesheet"]')) {
      const copy = style.cloneNode(true); if (copy.tagName === 'LINK') copy.href = style.href; document.head.append(copy);
    }
    const reset = document.createElement('style'); reset.textContent = 'html,body{margin:0;padding:0;overflow:hidden}body>.pf{min-height:400px}'; document.head.append(reset);
    setBody(document.body);
  }
  return <div ref={box} className="pp-prev-box" style={{ height: height * scale }}><iframe ref={frame} title={mobile ? 'Mobile public page preview' : 'Desktop public page preview'} srcDoc="<!doctype html><html><head></head><body></body></html>" onLoad={loaded} style={{ border: 0, width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }} />{body && createPortal(children, body)}</div>;
}
