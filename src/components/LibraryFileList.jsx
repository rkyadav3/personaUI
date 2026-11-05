import { fmtSize } from '../lib/format.js';
import { Pill } from './Ui.jsx';
import Icon from './portfolio/Icon.jsx';

export function LibraryFileList({ files, topicNames = {}, filtered = false, hasFolders = false, onOpen, onUpload, onReset }) {
  if (!files.length) return <div className="library-empty">
    <Icon n={filtered ? 'search' : 'folder'} size={36} />
    <h3>{filtered ? 'No matching files' : hasFolders ? 'No files at this level' : 'Your folder is ready for files'}</h3>
    <p>{filtered ? 'Try a different name, file type or status.' : hasFolders ? 'Open a folder above or add a file here.' : 'Upload documents or write a note to build your library.'}</p>
    <button type="button" className="btn primary" onClick={filtered ? onReset : onUpload}>{filtered ? 'Clear filters' : hasFolders ? 'Upload files' : 'Upload your first file'}</button>
  </div>;
  return <div className="library-table-wrap"><table className="library-table">
    <caption className="studio-sr-only">Files in the current folder</caption>
    <thead><tr><th scope="col">Name</th><th scope="col">Research topic</th><th scope="col">Size</th><th scope="col">AI access</th><th scope="col"><span className="studio-sr-only">Actions</span></th></tr></thead>
    <tbody>{files.map(file => <tr key={file.id}>
      <td><button type="button" className="library-file-name" onClick={() => onOpen(file.id)}><Icon n="file" size={20} /><span>{file.name}</span></button></td>
      <td>{topicNames[file.topic_id] || <span className="muted">Unassigned</span>}</td><td>{fmtSize(file.size)}</td>
      <td><Pill status={file.status} /></td>
      <td><button type="button" className="btn small" onClick={() => onOpen(file.id)} aria-label={`Manage ${file.name}`}>Manage</button></td>
    </tr>)}</tbody>
  </table></div>;
}
