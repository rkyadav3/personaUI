import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import JobsProfileView from '../components/JobsProfileView.jsx';
import PortfolioSite from '../components/portfolio/PortfolioSite.jsx';
import { useAuth } from '../lib/auth.jsx';
import { track } from '../lib/track.js';
import { Loading } from '../components/Ui.jsx';

export default function PublicProfile() {
  const { slug, sub } = useParams();
  const auth = useAuth();
  const [data, setData] = useState(undefined);   // undefined = loading, null = nothing to show

  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    fetch(`/api/profile?slug=${encodeURIComponent(slug || '')}`, { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!controller.signal.aborted) { setData(d); if (d?.name) document.title = `${d.name} · Portfolio`; } }, () => { if (!controller.signal.aborted) setData(null); });
    track({ kind: 'profile', slug });
    return () => controller.abort();
  }, [slug, auth?.user?.id]);

  if (data === undefined) return <Loading label="Loading profile…" />;
  if (!data) return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f3ff', color: '#1e1b4b', padding: 24, textAlign: 'center' }}>
      <div><h1 style={{ margin: '0 0 8px' }}>This profile isn't available</h1>
        <p style={{ margin: '0 0 16px', color: '#64748b' }}>It may not exist, or its owner hasn't published it yet.</p>
        <Link to="/" style={{ color: '#6d4aff', fontWeight: 600 }}>← Back to the home page</Link></div>
    </div>
  );
  if (data.profileType === 'jobs') return sub ? <Navigate to={`/p/${data.slug || slug}`} replace /> : <JobsProfileView data={data} />;
  return <PortfolioSite data={data} slug={data.slug || slug} sub={sub} user={auth?.user} />;
}
