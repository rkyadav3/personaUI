import { Navigate, useLocation, useParams } from 'react-router-dom';
import { settingsHref } from '../lib/publicPageSettings.js';

// Preserve old shared links without keeping a second public page or settings editor.
export function LegacyPersonaRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/p/${encodeURIComponent(slug || '')}/chat`} replace />;
}

export function LegacyPortfolioRedirect({ tab }) {
  const { search } = useLocation();
  return <Navigate to={settingsHref(search, tab)} replace />;
}
export function LegacyLookRedirect() { return <LegacyPortfolioRedirect tab="look" />; }
