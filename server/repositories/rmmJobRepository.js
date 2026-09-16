const pool = require('../db/pool');

async function claimNextForDevice(deviceId) {
  const result = await pool.query(
    `
    UPDATE rmm_jobs
    SET
      status = 'claimed',
      claimed_at = NOW()
    WHERE id = (
      SELECT id
      FROM rmm_jobs
      WHERE device_id = $1
        AND status = 'queued'
        AND NOT EXISTS (
          SELECT 1 FROM rmm_devices d JOIN assets a ON a.id = d.asset_id
          WHERE d.id = $1 AND (a.type IS NULL OR a.type NOT IN ('Desktop', 'Laptop', 'Server'))
        )
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING
      id,
      device_id,
      job_type,
      payload,
      status,
      created_at,
      claimed_at
    `,
    [deviceId]
  );

  return result.rows[0] || null;
}

// Guard ownership and transitions in the UPDATE itself, including concurrent reports.
async function reportResultForDevice(jobId, deviceId, result) {
  const updated = await pool.query(
    `UPDATE rmm_jobs
     SET status = $3,
         started_at = CASE WHEN $3 = 'started' THEN NOW() ELSE started_at END,
         completed_at = CASE WHEN $3 IN ('completed', 'failed') THEN NOW() ELSE completed_at END,
         result_code = $4,
         result_output = $5,
         result_error = $6
     WHERE id = $1 AND device_id = $2
       AND (
         ($3 = 'started' AND status = 'claimed')
         OR ($3 = 'completed' AND status = 'started')
         OR ($3 = 'failed' AND status IN ('claimed', 'started'))
       )
     RETURNING *`,
    [jobId, deviceId, result.status, result.result_code ?? null,
      result.result_output ?? null, result.result_error ?? null]
  );

  if (updated.rows[0]) return { job: updated.rows[0] };

  const existing = await pool.query(
    'SELECT id FROM rmm_jobs WHERE id = $1 AND device_id = $2',
    [jobId, deviceId]
  );
  return { error: existing.rows[0] ? 'invalid_transition' : 'not_found' };
}

async function createForDevice(deviceId, jobType, createdBy) {
  const result = await pool.query(
    `INSERT INTO rmm_jobs (device_id, job_type, status, created_by)
     VALUES ($1, $2, 'queued', $3)
     ON CONFLICT (device_id) WHERE job_type = 'windows_update_scan'
       AND status IN ('queued', 'claimed', 'started') DO NOTHING
     RETURNING *`,
    [deviceId, jobType, createdBy]
  );
  return result.rows[0];
}

async function findRecentForDevice(deviceId) {
  const result = await pool.query(
    `SELECT j.id, j.device_id, j.job_type, j.status, j.created_at,
            j.claimed_at, j.started_at, j.completed_at, j.result_code,
            j.result_output, j.result_error, j.created_by, u.username
     FROM rmm_jobs j
     LEFT JOIN users u ON j.created_by = u.id
     WHERE j.device_id = $1
     ORDER BY j.created_at DESC, j.id DESC
     LIMIT 25`,
    [deviceId]
  );
  return result.rows;
}

module.exports = {
  createForDevice,
  findRecentForDevice,
  claimNextForDevice,
  reportResultForDevice,
};
