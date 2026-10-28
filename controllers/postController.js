const Post = require('../models/Post');
const Topic = require('../models/Topic');
const Template = require('../models/Template');
const retrieval = require('../services/retrieval');

exports.index = (req, res) => res.render('admin/posts', { nav: 'posts', posts: Post.all() });

exports.create = (req, res) => {
  const tpl = req.query.template ? Template.find(req.query.template) : null;
  const id = Post.create({ title: 'Untitled', html: tpl ? tpl.html : '<p></p>', status: 'draft',
    topic_id: req.query.topic ? Number(req.query.topic) : null, template_id: tpl ? tpl.id : null });
  res.redirect('/admin/posts/' + id);
};

exports.edit = (req, res) => {
  const post = Post.find(req.params.id);
  if (!post) return res.status(404).send('Not found');
  res.render('admin/editor', { nav: 'posts', post, topics: Topic.all(), templates: Template.all() });
};

exports.save = (req, res) => {
  const { title, html, status, topic_id } = req.body;
  Post.update({ id: Number(req.params.id), title: title || 'Untitled', html: html || '',
    status: status === 'published' ? 'published' : 'draft', topic_id: topic_id ? Number(topic_id) : null });
  retrieval.invalidate();
  res.json({ ok: true, status });
};

exports.remove = (req, res) => { Post.remove(req.params.id); retrieval.invalidate(); res.redirect('/admin/posts'); };
