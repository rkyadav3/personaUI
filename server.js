require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));
app.use('/', require('./routes/public'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Site:  http://localhost:${PORT}\nAdmin: http://localhost:${PORT}/admin`));
