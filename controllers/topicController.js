const Topic = require('../models/Topic');
exports.index = (req, res) => res.render('admin/topics', { nav: 'topics', topics: Topic.all() });
exports.show = (req, res) => {
  const topic = Topic.find(req.params.id);
  if (!topic) return res.status(404).send('Not found');
  res.render('admin/topic', { nav: 'topics', topic, files: Topic.files(topic.id), posts: Topic.posts(topic.id) });
};
exports.create = (req, res) => { const id = Topic.create(req.body.name.trim(), req.body.description || ''); res.redirect('/admin/topics/' + id); };
exports.update = (req, res) => { Topic.update(req.params.id, req.body.name, req.body.description || ''); res.redirect('back'); };
exports.remove = (req, res) => { Topic.remove(req.params.id); res.redirect('/admin/topics'); };
