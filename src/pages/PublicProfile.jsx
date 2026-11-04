import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ProfilePage from '../components/ProfilePage.jsx';
import { useAuth } from '../lib/auth.jsx';
import { track } from '../lib/track.js';

export default function PublicProfile() {
  const { slug } = useParams();
  const auth = useAuth();
  const [data, setData] = useState(undefined);   // undefined = loading, null = nothing to show

  useEffect(() => {
    setData(undefined);
    fetch(`/api/profile?slug=${encodeURIComponent(slug || '')}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { setData(d); if (d?.name) document.title = `${d.name} · Persona`; }, () => setData(null));
    track({ kind: 'profile', slug });
  }, [slug]);

  if (data === undefined) return <p className="muted" style={{ padding: 40, textAlign: 'center' }}>Loading…</p>;
  if (!data) return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f3ff', color: '#1e1b4b', padding: 24, textAlign: 'center' }}>
      <div><h1 style={{ margin: '0 0 8px' }}>This profile isn't available</h1>
        <p style={{ margin: '0 0 16px', color: '#64748b' }}>It may not exist, or its owner hasn't published it yet.</p>
        <Link to="/" style={{ color: '#6d4aff', fontWeight: 600 }}>← Back to the home page</Link></div>
    </div>
  );
  return <ProfilePage data={data} slug={data.slug || slug} user={auth?.user} />;
}
