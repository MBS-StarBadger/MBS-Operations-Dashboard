const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userRepository = require('../repositories/userRepository');

async function login(req, res) {
  try {
    const { username, password } = req.body;

    const user = await userRepository.findByUsername(username);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  login,
};
