const File = require('../models/File');
const Post = require('../models/Post');
const Topic = require('../models/Topic');
exports.index = (req, res) => res.render('admin/dashboard', {
  nav: 'dashboard',
  files: File.counts(), posts: Post.counts(), topics: Topic.all(), recent: File.recent()
});
