import FileManager from './FileManager.jsx';

/**
 * AddFiles is now unified within FileManager's tab system.
 * Navigating to /admin/add opens the Upload tab directly.
 */
export default function AddFiles() {
  return <FileManager defaultTab="upload" />;
}
