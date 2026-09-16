const pool = require('../db/pool');
const jobs = require('../repositories/rmmJobRepository');
const audit = require('../repositories/rmmAuditRepository');
const WEEK = 7 * 24 * 60 * 60 * 1000;

function isDue(device, now = Date.now()) {
  if (device.active_scan) return false;
  // Recent jobs also back off agents that fail before sending attempt telemetry.
  const dates = [device.update_attempted_at, device.update_refreshed_at, device.last_scan_job_at]
    .filter(value => value != null).map(value => new Date(value).getTime());
  if (dates.some(value => !Number.isFinite(value))) return false;
  return dates.length === 0 || now - Math.max(...dates) >= WEEK;
}

async function run(now = Date.now()) {
  const { rows } = await pool.query(`
    SELECT d.id, d.update_attempted_at, d.update_refreshed_at,
      MAX(j.created_at) AS last_scan_job_at,
      COALESCE(BOOL_OR(j.status IN ('queued', 'claimed', 'started')), false) AS active_scan
    FROM rmm_devices d
    LEFT JOIN assets a ON a.id = d.asset_id
    LEFT JOIN rmm_jobs j ON j.device_id = d.id AND j.job_type = 'windows_update_scan'
    WHERE d.os_name ILIKE '%Windows%'
      AND (d.asset_id IS NULL OR a.type IN ('Desktop', 'Laptop', 'Server'))
    GROUP BY d.id
  `);
  for (const device of rows) {
    if (!isDue(device, now)) continue;
    try {
      const job = await jobs.createForDevice(device.id, 'windows_update_scan', null);
      if (!job) continue; // Unique partial index arbitrates simultaneous manual/server requests.
      await audit.insert({deviceId:device.id, action:'RMM_JOB_CREATED', result:'success',
        details:`Automatically queued windows_update_scan job ${job.id}`, mfaVerified:false});
    } catch (error) {
      console.error('Automatic Windows Update scan scheduling failed:', error);
    }
  }
}

function start() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await run(); }
    catch (error) { console.error('Windows Update scheduler failed:', error); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(tick, 60 * 60 * 1000);
  timer.unref();
  return timer;
}
module.exports = { isDue, run, start };
