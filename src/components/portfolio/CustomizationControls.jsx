import { CUSTOMIZATION_FIELDS, CUSTOMIZATION_DEFAULTS, normalizeCustomization, applyStylePreset } from '../../../shared/customization.js';
import { Field } from '../Ui.jsx';

const names = { intro: 'Introduction', updates: 'Updates', events: 'Events', projects: 'Projects', store: 'Store', about: 'About', home: 'Home', activity: 'Activity', chat: 'Chat', contact: 'Contact' };
const title = value => names[value] || value.replaceAll('_', ' ').replace(/^./, char => char.toUpperCase());

export default function CustomizationControls({ area, value, onChange, references = {} }) {
  const current = normalizeCustomization(value);
  const entries = Object.entries(CUSTOMIZATION_FIELDS).filter(([, field]) => field.area === area || area === 'appearance' && field.area === 'navigation');
  const change = (key, next) => onChange(key === 'preset' ? applyStylePreset(current, next) : normalizeCustomization({ ...current, [key]: next }));
  function control([key, field]) {
    if (field.type === 'boolean') return <label key={key} className="toggle"><input type="checkbox" checked={current[key]} onChange={event => change(key, event.target.checked)} />{field.label}</label>;
    if (field.ordered) return <fieldset key={key} className="customization-order"><legend>{field.label}</legend>{current[key].map((item, index) => <div className="row" key={item}><span className="grow">{title(item)}</span>{[-1, 1].map(direction => <button key={direction} type="button" className="btn small" disabled={index + direction < 0 || index + direction >= current[key].length} aria-label={`Move ${title(item)} ${direction < 0 ? 'up' : 'down'}`} onClick={() => { const list = [...current[key]]; [list[index], list[index + direction]] = [list[index + direction], list[index]]; change(key, list); }}>{direction < 0 ? 'Move up' : 'Move down'}</button>)}</div>)}</fieldset>;
    if (['list', 'references'].includes(field.type)) {
      const options = [...(field.options?.map(id => ({ id, title: title(id) })) || references[key] || [])];
      if (field.type === 'references') for (const id of current[key]) if (!options.some(row => row.id === id)) options.push({ id, title: 'Removed record (no longer displayed)' });
      const selected = current[key];
      return <fieldset key={key} className="customization-choices"><legend>{field.label}</legend>{field.type === 'references' && <p className="hint">Leave empty to use the default selection.</p>}{options.length ? options.map(option => <label key={option.id} className="toggle"><input type="checkbox" checked={selected.includes(option.id)} disabled={!selected.includes(option.id) && field.max && selected.length >= field.max || key === 'activitySections' && selected.length === 1 && selected.includes(option.id)} onChange={event => change(key, event.target.checked ? [...selected, option.id] : selected.filter(id => id !== option.id))} />{option.title}</label>) : <p className="hint">Add records in Store or Activity to select them here.</p>}</fieldset>;
    }
    return <Field key={key} label={field.label}>{field.type === 'select' ? <select value={current[key]} onChange={event => change(key, event.target.value)}>{field.options.map(option => <option key={option} value={option}>{title(option)}</option>)}</select> : <input type={field.type === 'number' ? 'number' : 'text'} min={field.min} max={field.max} maxLength={field.type === 'text' ? field.max : field.type === 'colour' ? 7 : undefined} placeholder={field.type === 'colour' ? '#123456' : undefined} value={value?.[key] ?? current[key]} onChange={event => onChange({ ...current, ...value, [key]: field.type === 'number' ? Number(event.target.value) : event.target.value })} />}</Field>;
  }
  return <section className="card customization-controls"><div className="head"><h3>{area === 'appearance' ? 'Site style' : `${title(area)} layout & display`}</h3><button type="button" className="btn small" onClick={() => onChange(normalizeCustomization({ ...current, ...Object.fromEntries(entries.map(([key]) => [key, CUSTOMIZATION_DEFAULTS[key]])) }))}>Reset this section</button></div>{entries.filter(([, field]) => !field.advanced).map(control)}<details><summary>Advanced page options</summary>{entries.filter(([, field]) => field.advanced).map(control)}</details><p className="hint">You can ask your assistant to change any of these settings. Review and approve its proposal before publishing.</p></section>;
}
