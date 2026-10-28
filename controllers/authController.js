exports.form = (req, res) => res.render('admin/login', { error: null });
exports.login = (req, res) => {
  const { username, password } = req.body;
  if (username === (process.env.ADMIN_USER || 'admin') && password === (process.env.ADMIN_PASSWORD || 'admin')) {
    req.session.admin = true;
    return res.redirect('/admin');
  }
  res.status(401).render('admin/login', { error: 'Wrong username or password.' });
};
exports.logout = (req, res) => req.session.destroy(() => res.redirect('/admin/login'));
