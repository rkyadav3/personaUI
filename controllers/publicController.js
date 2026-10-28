const Topic = require('../models/Topic');
const Post = require('../models/Post');
exports.home = (req, res) => res.render('public/home');
// Items that roam around the persona: topics and published posts.
exports.items = (req, res) => res.json({
  topics: Topic.all().map(t => ({ id: t.id, name: t.name, description: t.description })),
  posts: Post.published().map(p => ({ id: p.id, title: p.title, html: p.html }))
});
