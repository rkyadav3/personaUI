const db = require('../config/db');
module.exports = {
  all: () => db.prepare(`SELECT p.id,p.title,p.status,p.updated_at,t.name AS topic
      FROM posts p LEFT JOIN topics t ON t.id=p.topic_id ORDER BY p.updated_at DESC`).all(),
  find: id => db.prepare('SELECT * FROM posts WHERE id=?').get(id),
  create: p => db.prepare('INSERT INTO posts (title, html, status, topic_id, template_id) VALUES (@title,@html,@status,@topic_id,@template_id)').run(p).lastInsertRowid,
  update: p => db.prepare(`UPDATE posts SET title=@title, html=@html, status=@status, topic_id=@topic_id,
      updated_at=CURRENT_TIMESTAMP WHERE id=@id`).run(p),
  remove: id => db.prepare('DELETE FROM posts WHERE id=?').run(id),
  published: () => db.prepare("SELECT id,title,html FROM posts WHERE status='published'").all(),
  counts: () => db.prepare("SELECT COUNT(*) AS n, SUM(status='draft') AS drafts FROM posts").get()
};
