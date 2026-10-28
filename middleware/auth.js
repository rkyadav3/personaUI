exports.requireAdmin = (req, res, next) => {
  if (req.session && req.session.admin) return next();
  if (req.originalUrl.startsWith('/admin/api') || req.xhr) return res.status(401).json({ error: 'Not signed in' });
  res.redirect('/admin/login');
};
