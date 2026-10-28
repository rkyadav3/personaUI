const router = require('express').Router();
router.post('/chat', require('../controllers/chatController').ask);
router.get('/items', require('../controllers/publicController').items);
module.exports = router;
