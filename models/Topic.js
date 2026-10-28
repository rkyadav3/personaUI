const db = require('../config/db');
module.exports = {
  all: () => db.prepare(`SELECT t.*,
      (SELECT COUNT(*) FROM files f WHERE f.topic_id=t.id) AS file_count,
      (SELECT COUNT(*) FROM posts p WHERE p.topic_id=t.id) AS post_count
      FROM topics t ORDER BY t.name`).all(),
  find: id => db.prepare('SELECT * FROM topics WHERE id=?').get(id),
  create: (name, description = '') => db.prepare('INSERT INTO topics (name, description) VALUES (?,?)').run(name, description).lastInsertRowid,
  update: (id, name, description) => db.prepare('UPDATE topics SET name=?, description=? WHERE id=?').run(name, description, id),
  remove: id => db.prepare('DELETE FROM topics WHERE id=?').run(id),
  files: id => db.prepare('SELECT * FROM files WHERE topic_id=? ORDER BY name').all(id),
  posts: id => db.prepare('SELECT id,title,status,updated_at FROM posts WHERE topic_id=? ORDER BY updated_at DESC').all(id)
};
