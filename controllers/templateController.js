const Template = require('../models/Template');
exports.index = (req, res) => res.render('admin/templates', { nav: 'templates', templates: Template.all() });
exports.save = (req, res) => {
  const { id, name, html } = req.body;
  if (id) Template.update(id, name, html); else Template.create(name || 'Untitled template', html || '');
  res.redirect('/admin/templates');
};
exports.remove = (req, res) => { Template.remove(req.params.id); res.redirect('/admin/templates'); };
