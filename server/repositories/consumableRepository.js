const pool = require('../db/pool');

async function findAll() {
  const result = await pool.query(
    'SELECT * FROM consumables ORDER BY name'
  );

  return result.rows;
}

async function insert(values) {
  const result = await pool.query(
    'INSERT INTO consumables (name, quantity, low_at, notes) VALUES ($1,$2,$3,$4) RETURNING *',
    [
      values.name,
      values.quantity,
      values.low_at,
      values.notes,
    ]
  );

  return result.rows[0];
}

async function update(id, values) {
  const result = await pool.query(
    'UPDATE consumables SET name=$1, quantity=$2, low_at=$3, notes=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
    [
      values.name,
      values.quantity,
      values.low_at,
      values.notes,
      id,
    ]
  );

  return result.rows[0];
}

async function deleteById(id) {
  await pool.query(
    'DELETE FROM consumables WHERE id = $1',
    [id]
  );
}

module.exports = {
  findAll,
  insert,
  update,
  deleteById,
};
