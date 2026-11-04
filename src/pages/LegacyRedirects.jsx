import { Navigate, useParams } from 'react-router-dom';

// Preserve old shared links without keeping a second public page or settings editor.
export function LegacyPersonaRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/p/${encodeURIComponent(slug || '')}/chat`} replace />;
}

export function LegacyLookRedirect() { return <Navigate to="/admin/portfolio?tab=look" replace />; }
export function LegacySettingsRedirect() { return <Navigate to="/admin/portfolio?tab=persona" replace />; }
