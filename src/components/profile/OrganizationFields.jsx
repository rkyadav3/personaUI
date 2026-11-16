import { ORGANIZATION_FIELDS, ORGANIZATION_TYPES } from '../../../shared/organization.js';
import { Field } from '../Ui.jsx';

export default function OrganizationFields({ draft, onChange }) {
  const p = draft.profile, org = p.organization || { type: '', details: {} };
  const update = (key, value) => { const next = structuredClone(draft); next.profile.organization = { ...org, [key]: value }; onChange(next); };
  const updateName = value => { const next = structuredClone(draft); next.profile.name = value; onChange(next); };
  return <section className="card organization-fields"><h3>Organization details</h3><div className="cols c2">
    <Field label="Organization name *"><input required maxLength={120} value={p.name || ''} onChange={e => updateName(e.target.value)} /></Field>
    <Field label="Organization type *"><select required value={org.type} onChange={e => update('type', e.target.value)}><option value="">Choose a type</option>{Object.entries(ORGANIZATION_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <Field label="Official website"><input type="url" placeholder="https://" value={org.website || ''} onChange={e => update('website', e.target.value)} /></Field>
    <Field label="Founded year"><input type="number" min={1000} max={2100} value={org.foundedYear || ''} onChange={e => update('foundedYear', e.target.value ? Number(e.target.value) : null)} /></Field>
  </div><Field label="Who should your persona help? *"><input maxLength={500} value={org.audience || ''} onChange={e => update('audience', e.target.value)} /></Field>
  <Field label="What should your persona help people understand? *"><textarea rows={3} maxLength={1000} value={org.chatPurpose || ''} onChange={e => update('chatPurpose', e.target.value)} /></Field>
  <Field label="Mission and values"><textarea rows={3} maxLength={1500} value={org.mission || ''} onChange={e => update('mission', e.target.value)} /></Field>
  <Field label="Locations"><input value={(org.locations || []).join(', ')} onChange={e => update('locations', e.target.value.split(',').map(v => v.trim()).filter(Boolean))} /></Field>
  {(ORGANIZATION_FIELDS[org.type] || []).map(([key, label]) => <Field key={key} label={label}><textarea rows={2} maxLength={1000} value={org.details?.[key] || ''} onChange={e => update('details', { ...org.details, [key]: e.target.value })} /></Field>)}
  </section>;
}
