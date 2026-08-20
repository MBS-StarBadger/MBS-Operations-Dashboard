const bcrypt = require('bcryptjs');

const userRepository = require('../repositories/userRepository');

async function listUsers(req, res) {
  const users = await userRepository.findAll();
  res.json(users);
}

async function createUser(req, res) {
  try {
    const { username, password, role } = req.body;

    const hash = await bcrypt.hash(password, 10);

    const user = await userRepository.insert({
      username,
      password: hash,
      role: role || 'user',
    });

    res.json(user);
  } catch (err) {
    res.status(400).json({ error: 'Username already exists' });
  }
}

async function updateUserPassword(req, res) {
  const hash = await bcrypt.hash(req.body.password, 10);

  await userRepository.updatePassword(
    req.params.id,
    hash
  );

  res.json({ success: true });
}

module.exports = {
  listUsers,
  createUser,
  updateUserPassword,
};
