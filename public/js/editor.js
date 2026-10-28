(() => {
  const page = document.getElementById('page');
  const src = document.getElementById('src');
  const state = document.getElementById('state');
  document.execCommand('styleWithCSS', false, true);

  // Toolbar buttons / dropdowns / colour pickers
  const run = (cmd, val) => { page.focus(); document.execCommand(cmd, false, val); };
  document.querySelectorAll('#toolbar button[data-cmd]').forEach(b =>
    b.addEventListener('mousedown', e => { e.preventDefault(); run(b.dataset.cmd); }));
  document.querySelectorAll('#toolbar select[data-cmd]').forEach(s =>
    s.addEventListener('change', () => { if (s.value) run(s.dataset.cmd, s.dataset.cmd === 'formatBlock' ? `<${s.value}>` : s.value); }));
  document.querySelectorAll('#toolbar input[data-cmd]').forEach(i =>
    i.addEventListener('input', () => run(i.dataset.cmd, i.value)));

  document.getElementById('link').onclick = () => { const u = prompt('Link address'); if (u) run('createLink', u); };
  document.getElementById('image').onclick = () => { const u = prompt('Image address'); if (u) run('insertImage', u); };
  document.getElementById('table').onclick = () => {
    const r = +prompt('Rows', 3) || 0, c = +prompt('Columns', 3) || 0;
    if (!r || !c) return;
    const row = '<tr>' + '<td>&nbsp;</td>'.repeat(c) + '</tr>';
    run('insertHTML', `<table class="tbl"><tbody>${row.repeat(r)}</tbody></table><p></p>`);
  };

  // Visual <-> HTML source
  document.getElementById('source').onclick = () => {
    if (src.hidden) { src.value = page.innerHTML; src.hidden = false; page.hidden = true; }
    else { page.innerHTML = src.value; src.hidden = true; page.hidden = false; }
  };

  async function save(status) {
    if (!src.hidden) page.innerHTML = src.value;
    state.textContent = 'Saving...';
    const r = await fetch(`/admin/posts/${postId}/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: document.getElementById('title').value, html: page.innerHTML,
        topic_id: document.getElementById('topic').value, status })
    });
    state.textContent = r.ok ? (status === 'draft' ? 'Saved as draft' : 'Published') : 'Save failed';
  }
  document.getElementById('draft').onclick = () => save('draft');
  document.getElementById('publish').onclick = () => save('published');

  // Autosave as draft every 30s if the post isn't published
  setInterval(() => { if (state.textContent === 'Draft' || state.textContent.startsWith('Saved')) save('draft'); }, 30000);
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save('draft'); } });
})();
