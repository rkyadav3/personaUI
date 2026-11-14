import { useEffect, useRef } from 'react';
import Icon from './portfolio/Icon.jsx';

export default function AdminDialog({ titleId, children, onClose, busy = false, closeLabel = 'Close dialog' }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current, previous = document.activeElement;
    dialog.showModal();
    dialog.querySelector('input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus();
    return () => { if (dialog.open) dialog.close(); if (previous?.isConnected) previous.focus?.(); };
  }, []);
  return <dialog ref={ref} className="admin-dialog" aria-labelledby={titleId} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => {
      if (event.target !== ref.current || busy) return;
      const rect = ref.current.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <button type="button" className="admin-dialog-close" aria-label={closeLabel} onClick={onClose} disabled={busy}><Icon n="x" size={20} /></button>
    {children}
  </dialog>;
}
