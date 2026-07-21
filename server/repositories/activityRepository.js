const pool = require('../db/pool');

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
  insert,
};
