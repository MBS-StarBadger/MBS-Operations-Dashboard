const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  const authorization = req.headers.authorization;
  const token = authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = auth;