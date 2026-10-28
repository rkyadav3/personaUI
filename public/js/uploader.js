// Upload queue: files, whole folders (keeps structure), drag-and-drop, zips.
(() => {
  const form = document.getElementById('uploadForm');
  const drop = document.getElementById('drop');
  const queueEl = document.getElementById('queue');
  const sendBtn = document.getElementById('send');
  let queue = []; // { file, path }

  const render = () => {
    queueEl.textContent = queue.length ? `${queue.length} file${queue.length > 1 ? 's' : ''} ready.` : 'No files chosen.';
    sendBtn.disabled = !queue.length;
  };
  const add = (file, path) => { queue.push({ file, path: path || file.webkitRelativePath || file.name }); render(); };

  for (const id of ['pickFiles', 'pickFolder', 'pickZip']) {
    document.getElementById(id).addEventListener('change', e => { [...e.target.files].forEach(f => add(f)); e.target.value = ''; });
  }

  async function walk(entry, prefix = '') {
    if (entry.isFile) return new Promise(res => entry.file(f => { add(f, prefix + f.name); res(); }));
    const reader = entry.createReader();
    const read = () => new Promise(res => reader.readEntries(res));
    let batch;
    while ((batch = await read()).length) for (const e of batch) await walk(e, prefix + entry.name + '/');
  }
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async e => {
    e.preventDefault(); drop.classList.remove('over');
    for (const item of e.dataTransfer.items) { const en = item.webkitGetAsEntry && item.webkitGetAsEntry(); if (en) await walk(en); }
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    sendBtn.disabled = true; sendBtn.textContent = 'Uploading...';
    const fd = new FormData();
    ['folder', 'topic_id'].forEach(n => fd.append(n, form.elements[n].value));
    if (form.elements.unzip.checked) fd.append('unzip', 'on');
    queue.forEach(q => fd.append('paths', q.path)); // must come before files so multer sees them in order
    queue.forEach(q => fd.append('files', q.file, q.file.name));
    const r = await fetch(form.action, { method: 'POST', body: fd });
    if (r.ok) location.reload(); else { sendBtn.textContent = 'Upload failed. Try again.'; sendBtn.disabled = false; }
  });
})();
