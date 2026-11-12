import Writing from './Writing.jsx';

/**
 * Legacy Templates links open the shared Content workspace.
 * Navigating to /admin/templates opens the Templates tab directly.
 */
export default function Templates() {
  return <Writing defaultTab="templates" />;
}
