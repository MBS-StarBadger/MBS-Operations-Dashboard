const pool = require('../db/pool');

async function findAll() {
  const result = await pool.query(
    'SELECT * FROM shirts ORDER BY color, CASE size WHEN \'S\' THEN 1 WHEN \'M\' THEN 2 WHEN \'L\' THEN 3 WHEN \'XL\' THEN 4 WHEN \'2XL\' THEN 5 END'
  );

  return result.rows;
}

async function updateQuantity(id, quantity) {
  const result = await pool.query(
    'UPDATE shirts SET quantity=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
    [quantity, id]
  );

  return result.rows[0];
}

module.exports = {
  findAll,
  updateQuantity,
};
