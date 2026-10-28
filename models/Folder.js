const db = require('../config/db');
const Folder = {
  find: id => db.prepare('SELECT * FROM folders WHERE id=?').get(id),
  children: parent => parent
    ? db.prepare('SELECT * FROM folders WHERE parent_id=? ORDER BY name').all(parent)
    : db.prepare('SELECT * FROM folders WHERE parent_id IS NULL ORDER BY name').all(),
  create: (parent, name) => db.prepare('INSERT INTO folders (parent_id, name) VALUES (?,?)').run(parent || null, name).lastInsertRowid,
  rename: (id, name) => db.prepare('UPDATE folders SET name=? WHERE id=?').run(name, id),
  // Flat list like "Research / Notes" for folder pickers
  flat(parent = null, prefix = '') {
    const out = [];
    for (const f of Folder.children(parent)) { out.push({ id: f.id, path: prefix + f.name }); out.push(...Folder.flat(f.id, prefix + f.name + ' / ')); }
    return out;
  },
  breadcrumbs(id) {
    const trail = [];
    while (id) { const f = Folder.find(id); if (!f) break; trail.unshift(f); id = f.parent_id; }
    return trail;
  },
  // Creates nested folders for a relative path (folder uploads / zips); reuses existing ones.
  ensurePath(parent, parts) {
    let cur = parent || null;
    for (const name of parts.filter(Boolean)) {
      const existing = cur
        ? db.prepare('SELECT id FROM folders WHERE parent_id=? AND name=?').get(cur, name)
        : db.prepare('SELECT id FROM folders WHERE parent_id IS NULL AND name=?').get(name);
      cur = existing ? existing.id : Folder.create(cur, name);
    }
    return cur;
  },
  // Returns stored_names of every file below this folder so the controller can delete them from disk.
  storedNamesUnder(id) {
    const names = db.prepare('SELECT stored_name FROM files WHERE folder_id=?').all(id).map(r => r.stored_name);
    for (const c of Folder.children(id)) names.push(...Folder.storedNamesUnder(c.id));
    return names;
  },
  remove: id => db.prepare('DELETE FROM folders WHERE id=?').run(id)
};
module.exports = Folder;
