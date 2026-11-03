import Writing from './Writing.jsx';

/**
 * Templates is now unified within Writing Studio's tab system.
 * Navigating to /admin/templates opens the Templates tab directly.
 */
export default function Templates() {
  return <Writing defaultTab="templates" />;
}
