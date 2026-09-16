const text = max => value => typeof value === 'string' && value.length <= max;
const integer = max => value => Number.isSafeInteger(value) && value >= 0 && value <= max;
const date = value => typeof value === 'string' && value.length <= 40 &&
  /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const capacity = integer(Number.MAX_SAFE_INTEGER);
const moduleFields = { capacity_bytes: capacity, manufacturer: text(200), part_number: text(200),
  speed_mhz: integer(100000), configured_speed_mhz: integer(100000), bank: text(100), locator: text(100) };
const diskFields = { model: text(300), serial_number: text(200), capacity_bytes: capacity,
  media_type: text(100), bus_type: text(100) };
const hardwareFields = {
  cpu_manufacturer: text(200), cpu_name: text(300), processor_count: integer(1024),
  core_count: integer(65536), logical_processor_count: integer(131072), total_memory_bytes: capacity,
  bios_manufacturer: text(200), bios_version: text(300), bios_release_date: date,
  system_uuid: text(100), os_build: text(100), last_boot_at: date, uptime_seconds: integer(3155760000),
};
const legacyFields = { hostname: text(100), os_name: text(100), os_version: text(100),
  architecture: text(50), serial_number: text(100), manufacturer: text(100), model: text(100),
  ip_address: text(64), logged_in_user: text(100), agent_version: text(50) };
const boolean = value => typeof value === 'boolean';
const strings = (limit, max) => value => Array.isArray(value) && value.length <= limit && value.every(text(max));
const updateFields = {
  update_attempted_at: date, update_refreshed_at: date,
  update_scan_status: value => ['success', 'failed', 'unavailable'].includes(value),
  update_pending_count: integer(10000), update_security_count: integer(10000),
  update_driver_count: integer(10000), update_reboot_required: boolean,
};
const updateItemFields = { title: text(1000), update_id: text(100), revision: integer(2147483647),
  kb_ids: strings(32, 32), categories: strings(32, 200), category_ids: strings(32, 100),
  severity: text(100), downloaded: boolean, installed: boolean, reboot_may_be_required: boolean };
function validateUpdates(body) {
  const result = {};
  for (const [field, valid] of Object.entries(updateFields)) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    if (body[field] !== null && !valid(body[field])) throw new Error(`Invalid inventory field: ${field}`);
    result[field] = body[field];
  }
  if (Object.prototype.hasOwnProperty.call(body, 'pending_updates')) {
    const rows = body.pending_updates;
    if (rows !== null && (!Array.isArray(rows) || rows.length > 200)) throw new Error('Invalid pending_updates (maximum 200)');
    result.pending_updates = rows === null ? null : rows.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid pending update');
      const item = {};
      for (const key of Object.keys(row)) {
        if (!Object.prototype.hasOwnProperty.call(updateItemFields, key) || (row[key] !== null && !updateItemFields[key](row[key]))) throw new Error(`Invalid pending update field: ${key}`);
        item[key] = row[key];
      }
      return item;
    });
    if (rows && body.update_pending_count != null && rows.length > body.update_pending_count) throw new Error('Pending details exceed count');
  }
  for (const field of ['update_security_count', 'update_driver_count']) {
    if (body[field] != null && body.update_pending_count != null && body[field] > body.update_pending_count) throw new Error('Classification count exceeds total');
  }
  return result;
}
const calendarDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const softwareFields = {
  software_attempted_at: value => date(value) && calendarDate(value.slice(0,10)),
  software_refreshed_at: value => date(value) && calendarDate(value.slice(0,10)),
  software_status: value => ['success', 'failed', 'unavailable'].includes(value),
  software_count: integer(1000),
};
const softwareItemFields = {
  display_name: value => text(300)(value) && value.trim().length > 0,
  display_version: text(100), publisher: text(200), install_date: calendarDate,
  install_location: text(500),
  source_views: value => Array.isArray(value) && value.length <= 2 && value.length > 0 &&
    new Set(value).size === value.length && value.every(v => ['registry64', 'registry32'].includes(v)),
};
function validateSoftware(body) {
  const result = {};
  for (const [field, valid] of Object.entries(softwareFields)) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    if (body[field] !== null && !valid(body[field])) throw new Error(`Invalid inventory field: ${field}`);
    result[field] = body[field];
  }
  if (Object.prototype.hasOwnProperty.call(body, 'installed_software')) {
    const rows = body.installed_software;
    if (rows !== null && (!Array.isArray(rows) || rows.length > 1000)) throw new Error('Invalid installed_software (maximum 1000)');
    result.installed_software = rows === null ? null : rows.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row) || !softwareItemFields.display_name(row.display_name)) throw new Error('Invalid software application');
      const item = {};
      for (const key of Object.keys(row)) {
        if (!Object.prototype.hasOwnProperty.call(softwareItemFields, key) ||
          (row[key] !== null && !softwareItemFields[key](row[key]))) throw new Error(`Invalid software field: ${key}`);
        item[key] = row[key];
      }
      return item;
    });
    if (rows !== null && body.software_count != null && rows.length !== body.software_count) throw new Error('Software count must match snapshot');
  }
  // A failed attempt cannot clear or replace any part of the successful snapshot.
  if (['failed', 'unavailable'].includes(body.software_status) &&
      ['software_refreshed_at', 'software_count', 'installed_software'].some(key => Object.prototype.hasOwnProperty.call(body, key))) {
    throw new Error('Failed software collection must omit successful snapshot fields');
  }
  return result;
}
function validateInventory(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Inventory must be an object');
  const hardware = { ...validateUpdates(body), ...validateSoftware(body) };
  for (const [field, valid] of Object.entries({ ...legacyFields, ...hardwareFields })) {
    const value = body[field];
    if (value != null && !valid(value)) throw new Error(`Invalid inventory field: ${field}`);
    if (field in hardwareFields && Object.prototype.hasOwnProperty.call(body, field)) {
      hardware[field] = value ?? null;
    }
  }
  for (const [field, schema, limit] of [['memory_modules', moduleFields, 128], ['physical_disks', diskFields, 64]]) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    const values = body[field];
    if (values == null) { hardware[field] = null; continue; }
    if (!Array.isArray(values) || values.length > limit) throw new Error(`Invalid inventory array: ${field} (maximum ${limit})`);
    hardware[field] = values.map(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid inventory item: ${field}`);
      const item = {};
      for (const [key, valid] of Object.entries(schema)) {
        if (value[key] != null && !valid(value[key])) throw new Error(`Invalid inventory field: ${field}.${key}`);
        item[key] = value[key] ?? null;
      }
      return item;
    });
  }
  return hardware;
}
module.exports = { validateInventory };
