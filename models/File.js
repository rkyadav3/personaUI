const db = require('../config/db');
module.exports = {
  inFolder: folder => folder
    ? db.prepare('SELECT * FROM files WHERE folder_id=? ORDER BY name').all(folder)
    : db.prepare('SELECT * FROM files WHERE folder_id IS NULL ORDER BY name').all(),
  find: id => db.prepare('SELECT * FROM files WHERE id=?').get(id),
  create: f => db.prepare(`INSERT INTO files (folder_id, topic_id, name, stored_name, mime, size, text_content, status)
      VALUES (@folder_id, @topic_id, @name, @stored_name, @mime, @size, @text_content, @status)`).run(f).lastInsertRowid,
  rename: (id, name) => db.prepare('UPDATE files SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name, id),
  setTopic: (id, topic) => db.prepare('UPDATE files SET topic_id=? WHERE id=?').run(topic || null, id),
  saveText: (id, text, status) => db.prepare('UPDATE files SET text_content=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(text, status, id),
  move: (id, folder) => db.prepare('UPDATE files SET folder_id=? WHERE id=?').run(folder || null, id),
  remove: id => db.prepare('DELETE FROM files WHERE id=?').run(id),
  search: q => db.prepare("SELECT id,name,folder_id FROM files WHERE name LIKE ? OR text_content LIKE ? LIMIT 50").all(`%${q}%`, `%${q}%`),
  counts: () => db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes FROM files').get(),
  recent: () => db.prepare('SELECT id,name,updated_at FROM files ORDER BY updated_at DESC LIMIT 6').all(),
  indexable: () => db.prepare("SELECT id,name,text_content FROM files WHERE text_content != '' AND status='published'").all()
};
