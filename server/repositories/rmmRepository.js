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
      d.cpu_manufacturer,
      d.cpu_name,
      d.processor_count,
      d.core_count,
      d.logical_processor_count,
      d.total_memory_bytes,
      d.memory_modules,
      d.bios_manufacturer,
      d.bios_version,
      d.bios_release_date,
      d.system_uuid,
      d.os_build,
      d.last_boot_at,
      d.uptime_seconds,
      d.physical_disks,
      d.update_attempted_at,
      d.update_refreshed_at,
      d.update_scan_status,
      d.update_pending_count,
      d.update_security_count,
      d.update_driver_count,
      d.update_reboot_required,
      d.pending_updates,
      d.software_attempted_at,
      d.software_refreshed_at,
      d.software_status,
      d.software_count,
      d.installed_software,
      d.health_snapshot_at,
      d.health_sample_fields,
      d.cpu_utilization_percent,
      d.memory_available_bytes,
      d.memory_utilization_percent,
      d.system_drive,
      d.system_drive_total_bytes,
      d.system_drive_free_bytes,
      d.system_drive_utilization_percent,


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
  hardware = {},
}) {
  const params = [agentId, hostname, osName, osVersion, architecture, serialNumber,
    ipAddress, loggedInUser, agentVersion, manufacturer, model];
  const hardwareColumns = [
    'cpu_manufacturer', 'cpu_name', 'processor_count', 'core_count',
    'logical_processor_count', 'total_memory_bytes', 'memory_modules',
    'bios_manufacturer', 'bios_version', 'bios_release_date', 'system_uuid',
    'os_build', 'last_boot_at', 'uptime_seconds', 'physical_disks',
    'health_sample_fields', 'health_snapshot_at', 'cpu_utilization_percent', 'memory_available_bytes', 'memory_utilization_percent', 'system_drive', 'system_drive_total_bytes', 'system_drive_free_bytes', 'system_drive_utilization_percent',
    'software_attempted_at', 'software_refreshed_at', 'software_status', 'software_count', 'installed_software',
    'update_attempted_at', 'update_refreshed_at', 'update_scan_status', 'update_pending_count', 'update_security_count', 'update_driver_count', 'update_reboot_required', 'pending_updates',
  ];
  const hardwareUpdates = [];
  // Only supplied fields enter SET; identifiers come from this fixed allowlist.
  for (const field of hardwareColumns) {
    if (!Object.prototype.hasOwnProperty.call(hardware, field)) continue;
    const jsonb = field === 'memory_modules' || field === 'physical_disks' || field === 'pending_updates' || field === 'installed_software' || field === 'health_sample_fields';
    const value = hardware[field];
    params.push(jsonb && value != null ? JSON.stringify(value) : value ?? null);
    hardwareUpdates.push(`${field} = $${params.length}${jsonb ? '::jsonb' : ''},`);
  }
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
      ${hardwareUpdates.join('\n      ')}
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
    params
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
