import Writing from './Writing.jsx';

/**
 * Templates shares article editing with Writing and navigation with Data Pipelines.
 * Navigating to /admin/templates opens the Templates tab directly.
 */
export default function Templates() {
  return <Writing defaultTab="templates" />;
}
