const pool = require('../db/pool');

async function findByUsername(username) {
  const result = await pool.query(
    'SELECT * FROM users WHERE username = $1',
    [username]
  );

  return result.rows[0];
}

async function findAll() {
  const result = await pool.query(
    'SELECT id, username, role, created_at FROM users ORDER BY id'
  );

  return result.rows;
}

async function insert(values) {
  const result = await pool.query(
    'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
    [
      values.username,
      values.password,
      values.role,
    ]
  );

  return result.rows[0];
}

async function updatePassword(id, password) {
  await pool.query(
    'UPDATE users SET password = $1 WHERE id = $2',
    [password, id]
  );
}

module.exports = {
  findByUsername,
  findAll,
  insert,
  updatePassword,
};
