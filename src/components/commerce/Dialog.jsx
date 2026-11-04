import { useEffect, useRef } from 'react';

export default function Dialog({ titleId, children, onClose, busy = false, suspended = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (suspended) return;
    const dialog = ref.current, previous = document.activeElement;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); previous?.focus?.(); };
  }, [suspended]);
  if (suspended) return null;
  return (
    <dialog ref={ref} className="persona-dialog" aria-labelledby={titleId}
      onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
      onClick={e => { if (e.target === ref.current && !busy) { const r = ref.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
      <button type="button" className="persona-close" aria-label="Close checkout" disabled={busy} onClick={onClose}>×</button>
      {children}
    </dialog>
  );
}
