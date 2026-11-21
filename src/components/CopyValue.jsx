import { useEffect, useState } from 'react';
import { Notice } from './Ui.jsx';
import '../styles/copyValue.css';

export default function CopyValue({ label, value, code = false, secret = false }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState(''), [visible, setVisible] = useState(false);
  useEffect(() => { setCopied(false); setError(''); setVisible(false); }, [value]);
  async function copy() {
    setError(''); setCopied(false);
    try { await navigator.clipboard.writeText(value); setCopied(true); }
    catch { setError('Copy was blocked by your browser. Select the value and copy it manually.'); }
  }
  return <div className="connection-value">
    <div className="connection-value-label"><strong>{label}</strong><button type="button" className="btn" aria-label={`Copy ${label}`} onClick={copy}>Copy</button></div>
    {code ? <pre tabIndex={0} aria-label={label}><code>{value}</code></pre> : <input aria-label={label} type={secret && !visible ? 'password' : 'text'} readOnly value={value} autoComplete="off" spellCheck={false} />}
    {secret && <button type="button" className="btn" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Hide key' : 'Show key'}</button>}
    {copied && <p role="status">Copied.</p>}<Notice kind="error">{error}</Notice>
  </div>;
}
