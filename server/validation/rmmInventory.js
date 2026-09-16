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
function validateInventory(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Inventory must be an object');
  const hardware = {};
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
