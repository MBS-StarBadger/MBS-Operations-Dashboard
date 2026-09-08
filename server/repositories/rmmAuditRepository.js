const pool = require('../db/pool');

async function findRecent(limit = 100) {
  const result = await pool.query(
    `
    SELECT
      l.id,
      l.action,
      l.result,
      l.details,
      l.source_ip,
      l.mfa_verified,
      l.correlation_id,
      l.created_at,
      u.username,
      d.hostname,
      d.agent_id
    FROM rmm_audit_log l
    LEFT JOIN users u ON l.user_id = u.id
    LEFT JOIN rmm_devices d ON l.device_id = d.id
    ORDER BY l.created_at DESC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}

async function insert(entry) {
  const result = await pool.query(
    `
    INSERT INTO rmm_audit_log (
      user_id,
      device_id,
      action,
      result,
      details,
      source_ip,
      mfa_verified,
      correlation_id
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
    `,
    [
      entry.userId || null,
      entry.deviceId || null,
      entry.action,
      entry.result || 'success',
      entry.details || null,
      entry.sourceIp || null,
      Boolean(entry.mfaVerified),
      entry.correlationId || null,
    ]
  );

  return result.rows[0];
}

module.exports = {
  findRecent,
  insert,
};
