const pool = require('../db/pool');

async function findRecent() {
  const result = await pool.query(
    `SELECT a.*, u.username FROM activity_log a
     JOIN users u ON a.user_id = u.id
     ORDER BY a.created_at DESC LIMIT 100`
  );

  return result.rows;
}

async function insert(userId, action, details) {
  await pool.query(
    `
      INSERT INTO activity_log (user_id, action, details)
      VALUES ($1, $2, $3)
    `,
    [userId, action, details]
  );
}

module.exports = {
  findRecent,
  insert,
};
