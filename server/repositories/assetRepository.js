const pool = require('../db/pool');

const INSERT_COLUMNS = [
  'asset_tag',
  'type',
  'name',
  'make',
  'model',
  'serial_number',
  'assigned_to',
  'location',
  'status',
  'condition',
  'windows_license',
  'autopilot_ready',
  'notes',
  'entra_name',
  'department',
  'imei',
  'warranty_expiry',
  'warranty_expired',
];

const UPDATE_COLUMNS = [
  ...INSERT_COLUMNS,
  'qr_code',
];

async function findAll() {
  const result = await pool.query(
    'SELECT * FROM assets ORDER BY created_at DESC'
  );

  return result.rows;
}

async function findById(id) {
  const result = await pool.query(
    'SELECT * FROM assets WHERE id = $1',
    [id]
  );

  return result.rows[0];
}

async function insert(values) {
  const placeholders = INSERT_COLUMNS
    .map((_, index) => `$${index + 1}`)
    .join(', ');

  const params = INSERT_COLUMNS.map((column) => values[column]);

  const result = await pool.query(
    `
      INSERT INTO assets (${INSERT_COLUMNS.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `,
    params
  );

  return result.rows[0];
}

async function update(id, values) {
  const assignments = UPDATE_COLUMNS
    .map((column, index) => `${column} = $${index + 1}`)
    .join(', ');

  const params = [
    ...UPDATE_COLUMNS.map((column) => values[column]),
    id,
  ];

  const result = await pool.query(
    `
      UPDATE assets
      SET ${assignments},
          updated_at=NOW()
      WHERE id = $${UPDATE_COLUMNS.length + 1}
      RETURNING *
    `,
    params
  );

  return result.rows[0];
}

async function deleteById(id) {
  await pool.query(
    'DELETE FROM assets WHERE id = $1',
    [id]
  );
}

module.exports = {
  findAll,
  findById,
  insert,
  update,
  deleteById,
};
