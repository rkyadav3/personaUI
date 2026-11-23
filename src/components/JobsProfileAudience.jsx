import { useId } from 'react';
import { JOBS_PROFILE_AUDIENCES } from '../../shared/jobsProfile.js';

export default function JobsProfileAudience({ value, section, onChange, disabled = false }) {
  const helpId = useId();
  return <fieldset className="jobs-profile-audience" disabled={disabled} aria-describedby={helpId}>
    <legend>Who can see this section?</legend>
    <div className="jobs-profile-audience-choices">
      {Object.entries(JOBS_PROFILE_AUDIENCES).map(([audience, label]) => <label key={audience}>
        <input type="checkbox" checked={value === audience} disabled={section === 'nation' && audience === 'public' || !!value && value !== audience} onChange={event => onChange(event.target.checked ? audience : '')} />
        <span>{label}</span>
      </label>)}
    </div>
    <p id={helpId} className="muted">Choose one visibility. Untick your current choice to select another.{section === 'nation' && ' Nation-growth ideas cannot be Public.'}</p>
  </fieldset>;
}
