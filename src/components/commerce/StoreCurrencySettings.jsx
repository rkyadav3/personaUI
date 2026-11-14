import { useState } from 'react';
import { CHECKOUT_CURRENCIES } from '../../../shared/commerce.js';
import { Field, Notice } from '../Ui.jsx';
import { api } from '../../lib/api.js';

export default function StoreCurrencySettings({ data, onSaved, disabled }) {
  const [currency, setCurrency] = useState(data.currency || 'INR'), [applyToItems, setApply] = useState(false);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(null);
  const changed = data.items.filter(item => (item.currency || data.currency) !== currency).length;
  async function save(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setNotice(null);
    try {
      await api('items.currency', { currency, applyToItems, expectedVersion: data.version });
      setNotice({ kind: 'success', text: applyToItems ? `Store items now use ${currency}. Existing receipts keep their original currency.` : `New items will use ${currency}. Existing item currencies are unchanged.` });
      setApply(false); onSaved();
    } catch (error) { setNotice({ kind: 'error', text: error.message }); }
    finally { setBusy(false); }
  }
  return <details className="card store-currency-settings"><summary>Store currency · {data.currency || 'INR'}</summary>
    <form onSubmit={save}><fieldset className="editor-fieldset" disabled={busy || disabled}>
      <Field label="Default Store currency"><select aria-label="Default Store currency" value={currency} onChange={event => setCurrency(event.target.value)}>{CHECKOUT_CURRENCIES.map(code => <option key={code}>{code}</option>)}</select><span className="hint">New items and the assistant use this currency. Each existing item keeps its saved currency.</span></Field>
      <label className="toggle"><input type="checkbox" checked={applyToItems} onChange={event => setApply(event.target.checked)} />Apply this currency to all existing items</label>
      {applyToItems && <p role="status">{changed} {changed === 1 ? 'item will change' : 'items will change'} to {currency}. Numeric prices stay the same; this does not perform an exchange-rate conversion. Existing purchases keep their original currency.</p>}
      <button className="btn primary">{busy ? 'Saving…' : applyToItems ? `Apply ${currency} to Store items` : 'Save default currency'}</button>
    </fieldset></form><Notice kind={notice?.kind}>{notice?.text}</Notice>
  </details>;
}
