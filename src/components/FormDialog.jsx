import { useId } from 'react';
import AdminDialog from './AdminDialog.jsx';
import { UploadGroup } from './MediaUpload.jsx';

export default function FormDialog({ title, children, onClose, busy = false }) {
  const titleId = useId();
  return <UploadGroup>{uploading => <AdminDialog titleId={titleId} onClose={onClose} busy={busy || uploading}>
    <h2 id={titleId}>{title}</h2>
    <fieldset className="editor-fieldset" disabled={busy || uploading}>{children}</fieldset>
  </AdminDialog>}</UploadGroup>;
}
