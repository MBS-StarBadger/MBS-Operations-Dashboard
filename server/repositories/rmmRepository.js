const pool = require('../db/pool');

async function findAll() {
  const result = await pool.query(`
    SELECT
      d.*,
      CASE
        WHEN d.last_seen >= NOW() - INTERVAL '2 minutes'
          THEN 'online'
        ELSE 'offline'
      END AS status,
      a.asset_tag,
      a.type AS asset_type,
      a.name AS asset_name,
      a.assigned_to
    FROM rmm_devices d
    LEFT JOIN assets a ON d.asset_id = a.id AND a.type IN ('Desktop', 'Laptop', 'Server')
    ORDER BY d.hostname ASC
  `);

  return result.rows;
}

async function getSummary() {
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE last_seen >= NOW() - INTERVAL '2 minutes'
      )::int AS online,
      COUNT(*) FILTER (
        WHERE last_seen < NOW() - INTERVAL '2 minutes'
           OR last_seen IS NULL
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

async function findById(id) {
  const result = await pool.query(
    `
    SELECT
      d.id,
      d.asset_id,
      d.agent_id,
      d.hostname,
      d.os_name,
      d.os_version,
      d.architecture,
      d.serial_number,
      d.manufacturer,
      d.model,
      d.ip_address,
      d.logged_in_user,
      d.agent_version,
      d.first_seen,
      d.last_seen,
      d.created_at,
      d.updated_at,

      CASE
        WHEN d.last_seen IS NULL
          THEN 'never'
        WHEN d.last_seen >= NOW() - INTERVAL '3 minutes'
          THEN 'online'
        WHEN d.last_seen >= NOW() - INTERVAL '10 minutes'
          THEN 'stale'
        ELSE 'offline'
      END AS health_status,

      CASE
        WHEN d.last_seen IS NULL THEN NULL
        ELSE EXTRACT(EPOCH FROM (NOW() - d.last_seen))::int
      END AS seconds_since_seen,

      a.asset_tag,
      a.type AS asset_type,
      a.name AS asset_name,
      a.assigned_to

    FROM rmm_devices d
    LEFT JOIN assets a ON d.asset_id = a.id AND a.type IN ('Desktop', 'Laptop', 'Server')
    WHERE d.id = $1
    LIMIT 1
    `,
    [id]
  );

  return result.rows[0] || null;
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
  manufacturer,
  model,
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
      manufacturer = $10,
      model = $11,
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
      manufacturer,
      model,
    ]
  );

  return result.rows[0] || null;
}

module.exports = {
  findAll,
  getSummary,
  findById,
  createEnrollment,
  findByAgentId,
  checkIn,
};
