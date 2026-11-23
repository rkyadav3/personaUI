export default function PlatformAccess({ value = [], onChange, disabled = false }) {
  return (
    <fieldset className="governance-tag-editor" disabled={disabled}>
      <legend>Superadmin feature access</legend>
      <label>
        <input
          type="checkbox"
          checked={value.length > 0}
          onChange={(event) => onChange(event.target.checked ? ['profiles.create'] : [])}
        />
        <span>Enable specific Superadmin features</span>
      </label>
      {value.length > 0 && (
        <label>
          <input
            type="checkbox"
            checked={value.includes('profiles.create')}
            onChange={(event) => onChange(event.target.checked ? ['profiles.create'] : [])}
          />
          <span>Create profiles</span>
        </label>
      )}
      <p className="muted">
        This grants only the Profiles tab. Approval, Master, payments and other platform controls remain with
        Superadmin.
      </p>
    </fieldset>
  );
}
