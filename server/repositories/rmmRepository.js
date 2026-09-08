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

async function createEnrollment({ agentId, hostname, tokenHash }) {
  const result = await pool.query(
    `
    INSERT INTO rmm_devices (
      agent_id,
      hostname,
      agent_token_hash,
      status
    )
    VALUES ($1, $2, $3, 'offline')
    RETURNING
      id,
      agent_id,
      hostname,
      status,
      created_at
    `,
    [agentId, hostname, tokenHash]
  );

  return result.rows[0];
}

async function findByAgentId(agentId) {
  const result = await pool.query(
    `
    SELECT *
    FROM rmm_devices
    WHERE agent_id = $1
    LIMIT 1
    `,
    [agentId]
  );

  return result.rows[0] || null;
}

async function checkIn({
  agentId,
  hostname,
  osName,
  osVersion,
  architecture,
  serialNumber,
  ipAddress,
  loggedInUser,
  agentVersion,
}) {
  const result = await pool.query(
    `
    UPDATE rmm_devices
    SET
      hostname = $2,
      os_name = $3,
      os_version = $4,
      architecture = $5,
      serial_number = $6,
      ip_address = $7,
      logged_in_user = $8,
      agent_version = $9,
      status = 'online',
      last_seen = NOW(),
      updated_at = NOW()
    WHERE agent_id = $1
    RETURNING
      id,
      agent_id,
      hostname,
      status,
      last_seen
    `,
    [
      agentId,
      hostname,
      osName,
      osVersion,
      architecture,
      serialNumber,
      ipAddress,
      loggedInUser,
      agentVersion,
    ]
  );

  return result.rows[0] || null;
}

module.exports = {
  findAll,
  getSummary,
  createEnrollment,
  findByAgentId,
  checkIn,
};
