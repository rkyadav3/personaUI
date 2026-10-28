const router = require('express').Router();
router.get('/', require('../controllers/publicController').home);
module.exports = router;
