import { useState } from 'react';
import { PLATFORM_PERMISSIONS } from '../../shared/rbac.js';

export default function PlatformAccess({ value = [], onChange, disabled = false }) {
  const [opened, setOpened] = useState(value.length > 0);
  const enabled = opened || value.length > 0;
  return (
    <fieldset className="governance-tag-editor" disabled={disabled}>
      <legend>Superadmin feature access</legend>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => { setOpened(event.target.checked); if (!event.target.checked) onChange([]); }}
        />
        <span>Enable specific Superadmin features</span>
      </label>
      {enabled && Object.entries(PLATFORM_PERMISSIONS).map(([key, label]) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={value.includes(key)}
            onChange={(event) => onChange(event.target.checked ? [...value, key] : value.filter(permission => permission !== key))}
          />
          <span>{label}</span>
        </label>
      ))}
      <p className="muted">
        Staff receive only the selected tools. Profile approval and granting platform access remain with Superadmin.
      </p>
    </fieldset>
  );
}
