const pool = require('../db/pool');
const audit = require('./rmmAuditRepository');

const eligibleTypes = new Set(['Desktop', 'Laptop', 'Server']);
const normalize = value => String(value ?? '').trim().toUpperCase();
const unusable = new Set(['', 'N/A', 'NA', 'UNKNOWN', 'NONE', 'NOT AVAILABLE', 'NULL',
  'DEFAULT STRING', 'TO BE FILLED BY O.E.M.', 'TO BE FILLED BY OEM', 'SYSTEM SERIAL NUMBER']);
const serialKey = value => {
  const key = normalize(value);
  return unusable.has(key) || /^0+$/.test(key) ? '' : key;
};

// Explicit aliases apply only to comparison keys; raw inventory stays untouched.
const manufacturerAliases = new Map([
  ['DELL INC.', 'DELL'],
  ['HP INC.', 'HP'],
  ['HEWLETT-PACKARD', 'HP'],
  ['HEWLETT PACKARD', 'HP'],
]);
function manufacturerKey(value) {
  const key = normalize(value).replace(/\s+/g, ' ');
  return manufacturerAliases.get(key) ?? key;
}

function compare(device, asset) {
  return [
    ['Serial number', asset.serial_number, device.serial_number, serialKey],
    ['Entra / Intune device name', asset.entra_name, device.hostname, normalize],
    ['Manufacturer', asset.make, device.manufacturer, manufacturerKey],
    ['Model', asset.model, device.model, normalize],
  ].flatMap(([field, assetValue, rmmValue, key]) => {
    const a = key(assetValue), r = key(rmmValue);
    if (!a && !r) return [];
    return [{ field, asset_value: assetValue ?? null, rmm_value: rmmValue ?? null,
      state: !a ? 'missing_in_asset' : !r ? 'missing_in_rmm' : a === r ? 'match' : 'mismatch' }];
  });
}

function evaluate(device, assets, devices) {
  assets = assets.filter(a => eligibleTypes.has(a.type));
  const key = serialKey(device.serial_number);
  const exact = key ? assets.filter(a => serialKey(a.serial_number) === key) : [];
  const linked = assets.find(a => a.id === device.asset_id);
  const result = (state, reason, candidates = []) => ({ state, reason,
    asset: linked || null, candidates, comparisons: linked ? compare(device, linked) : [] });
  if (device.asset_id != null && !linked) return result('conflict', 'Existing relationship is not an eligible asset. Review required.');
  if (exact.length > 1) return result('conflict', 'Serial matches multiple eligible assets.', exact);
  if (key && devices.filter(d => serialKey(d.serial_number) === key).length > 1) {
    return result('conflict', 'Serial is shared by multiple RMM endpoints.', exact);
  }
  const candidate = linked || exact[0];
  if (candidate && devices.some(d => d.id !== device.id && d.asset_id === candidate.id)) {
    return result('conflict', 'Asset is already linked to another RMM endpoint.', [candidate]);
  }
  if (linked) {
    if (key && serialKey(linked.serial_number) && key !== serialKey(linked.serial_number) ||
        exact[0] && exact[0].id !== linked.id) {
      return result('conflict', 'Observed serial contradicts the existing relationship; link preserved.', exact);
    }
    return result('linked', 'Existing eligible asset relationship preserved.');
  }
  if (exact.length === 1) return { ...result('possible_match', 'Unique serial match awaiting automatic correlation.', exact), autoLinkAsset: exact[0] };
  const hostname = normalize(device.hostname);
  const candidates = hostname ? assets.filter(a => [a.entra_name, a.name].some(v => normalize(v) === hostname)) : [];
  return candidates.length ? result('possible_match', 'Name-only evidence; automatic linking is prohibited.', candidates)
    : result('unmatched', 'No eligible asset match');
}

async function correlateDevice(deviceId, { autoLink = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query(autoLink ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if (autoLink) {
      // Prevent concurrent inserts, identity edits and competing links during evaluation.
      // Consistent table order also covers writers that do not use this repository.
      await client.query('LOCK TABLE assets, rmm_devices IN SHARE ROW EXCLUSIVE MODE');
    }
    const assets = (await client.query(`SELECT id, asset_tag, type, name, make, model,
      serial_number, entra_name, assigned_to, location, status
      FROM assets WHERE type IN ('Desktop', 'Laptop', 'Server')`)).rows;
    const devices = (await client.query(`SELECT id, asset_id, hostname, serial_number,
      manufacturer, model FROM rmm_devices`)).rows;
    const device = devices.find(d => d.id === deviceId);
    if (!device) { await client.query('COMMIT'); return null; }
    let result = evaluate(device, assets, devices);
    if (autoLink && result.autoLinkAsset) {
      const asset = result.autoLinkAsset;
      await client.query('UPDATE rmm_devices SET asset_id = $2, updated_at = NOW() WHERE id = $1 AND asset_id IS NULL', [deviceId, asset.id]);
      await audit.insert({ deviceId, action: 'RMM_ASSET_AUTO_LINKED', result: 'success',
        details: `Linked asset ${asset.id} (${asset.asset_tag}) by unique normalized serial` }, client);
      device.asset_id = asset.id;
      result = evaluate(device, assets, devices);
    }
    delete result.autoLinkAsset;
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = { correlateDevice, evaluate, compare, serialKey };
