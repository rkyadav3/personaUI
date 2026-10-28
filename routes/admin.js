const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { upload } = require('../config/upload');
const auth = require('../controllers/authController');
const dash = require('../controllers/dashboardController');
const files = require('../controllers/fileController');
const topics = require('../controllers/topicController');
const posts = require('../controllers/postController');
const templates = require('../controllers/templateController');

router.get('/login', auth.form);
router.post('/login', auth.login);
router.post('/logout', auth.logout);

router.use(requireAdmin);
router.get('/', dash.index);

router.get('/files', files.browse);
router.post('/files/upload', upload.array('files'), files.upload);
router.post('/folders', files.newFolder);
router.post('/folders/:id/rename', files.renameFolder);
router.post('/folders/:id/delete', files.deleteFolder);
router.get('/files/new', files.newForm);
router.post('/files/create', files.createText);
router.get('/files/:id', files.open);
router.get('/files/:id/download', files.download);
router.post('/files/:id/save', files.save);
router.post('/files/:id/move', files.move);
router.post('/files/:id/delete', files.remove);

router.get('/topics', topics.index);
router.post('/topics', topics.create);
router.get('/topics/:id', topics.show);
router.post('/topics/:id', topics.update);
router.post('/topics/:id/delete', topics.remove);

router.get('/posts', posts.index);
router.get('/posts/new', posts.create);
router.get('/posts/:id', posts.edit);
router.post('/posts/:id/save', posts.save);
router.post('/posts/:id/delete', posts.remove);

router.get('/templates', templates.index);
router.post('/templates', templates.save);
router.post('/templates/:id/delete', templates.remove);

module.exports = router;
