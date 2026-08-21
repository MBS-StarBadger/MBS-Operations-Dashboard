const pool = require('../db/pool');

async function findAll() {
  const result = await pool.query(`
    SELECT
      d.*,
      a.asset_tag,
      a.name AS asset_name,
      a.assigned_to
    FROM rmm_devices d
    LEFT JOIN assets a ON d.asset_id = a.id
    ORDER BY d.hostname ASC
  `);

  return result.rows;
}

async function getSummary() {
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE status = 'online'
      )::int AS online,
      COUNT(*) FILTER (
        WHERE status <> 'online'
           OR status IS NULL
      )::int AS offline
    FROM rmm_devices
  `);

  return {
    total: result.rows[0].total,
    online: result.rows[0].online,
    offline: result.rows[0].offline,
    alerts: 0,
  };
}

module.exports = {
  findAll,
  getSummary,
};
