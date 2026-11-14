import { Navigate, useSearchParams } from 'react-router-dom';
export default function LegacyContentRedirect() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  if (['event', 'schedule', 'update'].includes(next.get('tab'))) next.set('kind', next.get('tab'));
  next.set('tab', 'events');
  return <Navigate to={`/admin/activity?${next}`} replace />;
}
