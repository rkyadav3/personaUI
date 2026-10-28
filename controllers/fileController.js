const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const crypto = require('crypto');
const { UPLOAD_DIR } = require('../config/upload');
const Folder = require('../models/Folder');
const File = require('../models/File');
const Topic = require('../models/Topic');
const { extractText, isText } = require('../services/extractor');
const retrieval = require('../services/retrieval');

const num = v => (v ? Number(v) : null);

exports.browse = (req, res) => {
  const folderId = num(req.query.folder);
  const q = (req.query.q || '').trim();
  res.render('admin/files', {
    nav: 'files', folderId, q,
    crumbs: Folder.breadcrumbs(folderId),
    folders: Folder.children(folderId),
    files: q ? File.search(q).map(f => File.find(f.id)) : File.inFolder(folderId),
    topics: Topic.all(), allFolders: Folder.flat()
  });
};

// Add files page (upload, create a text file, new folder). Browsing lives in the File manager.
exports.newForm = (req, res) => res.render('admin/files-new', {
  nav: 'filesnew', folderId: num(req.query.folder), folders: Folder.flat(), topics: Topic.all()
});

exports.createText = (req, res) => {
  const { name, ext, text, status, folder, topic_id } = req.body;
  let fname = (name || 'untitled').trim().replace(/[\\/]/g, '-') || 'untitled';
  if (!isText(fname)) fname += '.' + (['md', 'txt', 'html', 'csv', 'json'].includes(ext) ? ext : 'md');
  const body = text || '';
  const stored = crypto.randomBytes(16).toString('hex') + path.extname(fname);
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), body);
  const id = File.create({ folder_id: num(folder), topic_id: num(topic_id), name: fname, stored_name: stored, mime: '',
    size: Buffer.byteLength(body), text_content: body, status: status === 'draft' ? 'draft' : 'published' });
  retrieval.invalidate();
  res.redirect('/admin/files/' + id);
};

function saveBuffer(folder, name, buf, topic) {
  const stored = crypto.randomBytes(16).toString('hex') + path.extname(name);
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), buf);
  File.create({ folder_id: folder, topic_id: topic, name, stored_name: stored, mime: '', size: buf.length,
    text_content: extractText(path.join(UPLOAD_DIR, stored), name), status: 'published' });
}

// Handles single files, many files, whole folders (webkitdirectory) and zips.
exports.upload = (req, res) => {
  const base = num(req.body.folder);
  const topic = num(req.body.topic_id);
  const paths = [].concat(req.body.paths || []);
  (req.files || []).forEach((f, i) => {
    const rel = (paths[i] || f.originalname).replace(/\\/g, '/');
    const parts = rel.split('/');
    const name = parts.pop();
    const folder = Folder.ensurePath(base, parts);
    if (/\.zip$/i.test(name) && req.body.unzip === 'on') {
      const zipFolder = Folder.ensurePath(folder, [name.replace(/\.zip$/i, '')]);
      new AdmZip(f.path).getEntries().forEach(e => {
        if (e.isDirectory || e.entryName.startsWith('__MACOSX')) return;
        const eparts = e.entryName.split('/').filter(p => p && p !== '..' && p !== '.');
        const ename = eparts.pop();
        saveBuffer(Folder.ensurePath(zipFolder, eparts), ename, e.getData(), topic); // never writes using entry paths
      });
      fs.unlinkSync(f.path);
    } else {
      File.create({ folder_id: folder, topic_id: topic, name, stored_name: path.basename(f.path), mime: f.mimetype,
        size: f.size, text_content: extractText(f.path, name), status: 'published' });
    }
  });
  retrieval.invalidate();
  res.redirect('/admin/files' + (base ? `?folder=${base}` : ''));
};

exports.newFolder = (req, res) => {
  const parent = num(req.body.folder);
  if (req.body.name?.trim()) Folder.create(parent, req.body.name.trim());
  res.redirect('/admin/files' + (parent ? `?folder=${parent}` : ''));
};

exports.renameFolder = (req, res) => { Folder.rename(req.params.id, req.body.name.trim()); res.redirect('back'); };

exports.deleteFolder = (req, res) => {
  const f = Folder.find(req.params.id);
  Folder.storedNamesUnder(f.id).forEach(n => fs.rmSync(path.join(UPLOAD_DIR, n), { force: true }));
  Folder.remove(f.id);
  retrieval.invalidate();
  res.redirect('/admin/files' + (f.parent_id ? `?folder=${f.parent_id}` : ''));
};

exports.open = (req, res) => {
  const file = File.find(req.params.id);
  if (!file) return res.status(404).send('Not found');
  res.render('admin/file', {
    nav: 'files', file, editable: isText(file.name),
    crumbs: Folder.breadcrumbs(file.folder_id), topics: Topic.all()
  });
};

exports.save = (req, res) => {
  const { text, status, name, topic_id } = req.body;
  const file = File.find(req.params.id);
  if (isText(file.name)) {
    fs.writeFileSync(path.join(UPLOAD_DIR, file.stored_name), text || '');
    File.saveText(file.id, text || '', status === 'draft' ? 'draft' : 'published');
  }
  if (name && name !== file.name) File.rename(file.id, name);
  File.setTopic(file.id, num(topic_id));
  retrieval.invalidate(); // drafts are excluded from the persona's knowledge
  res.json({ ok: true, status });
};

exports.download = (req, res) => {
  const f = File.find(req.params.id);
  res.download(path.join(UPLOAD_DIR, f.stored_name), f.name);
};

exports.move = (req, res) => { File.move(req.params.id, num(req.body.folder)); res.redirect('back'); };

exports.remove = (req, res) => {
  const f = File.find(req.params.id);
  fs.rmSync(path.join(UPLOAD_DIR, f.stored_name), { force: true });
  File.remove(f.id);
  retrieval.invalidate();
  res.redirect('/admin/files' + (f.folder_id ? `?folder=${f.folder_id}` : ''));
};
