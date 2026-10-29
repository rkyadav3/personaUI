import { folderPaths } from '../lib/format.js';

const val = v => (v == null ? '' : String(v));

export function FolderSelect({ label = 'Save into folder', value, onChange, folders = [], topName = 'Top level' }) {
  return (
    <label className="f">{label}
      <select value={val(value)} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">{topName}</option>
        {folderPaths(folders).map(f => <option key={f.id} value={f.id}>{f.path}</option>)}
      </select>
    </label>
  );
}

export function TopicSelect({ label = 'Research topic', value, onChange, topics = [] }) {
  return (
    <label className="f">{label}
      <select value={val(value)} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">No topic</option>
        {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  );
}
