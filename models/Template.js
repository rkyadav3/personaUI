const db = require('../config/db');
module.exports = {
  all: () => db.prepare('SELECT * FROM templates ORDER BY name').all(),
  find: id => db.prepare('SELECT * FROM templates WHERE id=?').get(id),
  create: (name, html) => db.prepare('INSERT INTO templates (name, html) VALUES (?,?)').run(name, html).lastInsertRowid,
  update: (id, name, html) => db.prepare('UPDATE templates SET name=?, html=? WHERE id=?').run(name, html, id),
  remove: id => db.prepare('DELETE FROM templates WHERE id=?').run(id)
};
