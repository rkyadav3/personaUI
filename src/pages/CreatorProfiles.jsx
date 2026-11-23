import { useOp } from '../lib/hooks.js';
import { Loading, Notice } from '../components/Ui.jsx';
import ProfileCreation from '../components/ProfileCreation.jsx';
export default function CreatorProfiles() {
  const { data, error, reload } = useOp('platform.profiles.list');
  if (!data)
    return (
      <>
        <Loading error={error} label="Loading created profiles…" />
        {error && (
          <button className="btn" onClick={reload}>
            Retry
          </button>
        )}
      </>
    );
  return (
    <>
      <div className="head">
        <div>
          <h1>Profiles</h1>
          <p className="muted">
            Profiles you create require Superadmin approval before they can sign in or publish.
          </p>
        </div>
        <ProfileCreation onCreated={reload} />
      </div>
      <section className="card">
        <h2>Your created profiles</h2>
        {!data.users.length && (
          <Notice>Create an Individual or Organisation profile to request approval.</Notice>
        )}
        <div className="governance-table">
          <table className="data">
            <thead>
              <tr>
                <th>Profile</th>
                <th>Admin email</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((person) => (
                <tr key={person.id}>
                  <td>{person.name}</td>
                  <td>{person.email}</td>
                  <td>{person.approval_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
