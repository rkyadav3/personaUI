const path = require('path');
const { DatabaseSync } = require('node:sqlite'); // built into Node 22.5+, no native build needed
const db = new DatabaseSync(path.join(__dirname, '..', 'storage', 'db', 'portfolio.sqlite'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY, folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  name TEXT NOT NULL, stored_name TEXT NOT NULL, mime TEXT, size INTEGER DEFAULT 0,
  text_content TEXT DEFAULT '', status TEXT DEFAULT 'published',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, html TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL DEFAULT 'Untitled',
  html TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft',
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

if (!db.prepare('SELECT 1 FROM templates LIMIT 1').get()) {
  const t = db.prepare('INSERT INTO templates (name, html) VALUES (?, ?)');
  t.run('Blank', '<p></p>');
  t.run('Research note', '<h1>Title</h1><p><em>Question, method, finding.</em></p><h2>Question</h2><p></p><h2>Method</h2><p></p><h2>Findings</h2><p></p><h2>Open problems</h2><p></p>');
  t.run('Blog post', '<h1>Headline</h1><p>Opening paragraph.</p><h2>Section</h2><p></p><blockquote>A line worth quoting.</blockquote>');
}
module.exports = db;
