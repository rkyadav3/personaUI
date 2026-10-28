const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', 'storage', 'uploads');
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname))
});
module.exports = { UPLOAD_DIR, upload: multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }) };
