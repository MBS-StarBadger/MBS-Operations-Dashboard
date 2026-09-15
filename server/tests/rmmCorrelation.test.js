jest.mock('jsonwebtoken');
const pool = require('../db/pool');
jest.mock('../db/pool', () => ({ connect: jest.fn(), query: jest.fn() }));
const { evaluate, correlateDevice } = require('../repositories/rmmCorrelationRepository');
const asset = { id: 40, asset_tag: 'TEST-ASSET', type: 'Laptop', serial_number: ' abC ', entra_name: 'HOST', make: 'Dell', model: 'Latitude' };
const device = { id: 7, asset_id: null, serial_number: 'ABC', hostname: 'host', manufacturer: 'dell', model: 'Latitude' };
const run = (d = device, assets = [asset], devices = [d]) => evaluate(d, assets, devices);

test('unique eligible serial qualifies without mutating stored serials', () => {
  expect(run().autoLinkAsset).toEqual(asset);
  expect(asset.serial_number).toBe(' abC ');
});
test.each(['Monitor', 'Other', 'Phone', 'desktop'])('out-of-scope %s never matches by serial or name', type => {
  expect(run(device, [{ ...asset, type }])).toMatchObject({ state: 'unmatched', candidates: [] });
});
test('duplicate eligible asset serial conflicts', () => {
  expect(run(device, [asset, { ...asset, id: 41 }]).state).toBe('conflict');
});
test('duplicate endpoint serial conflicts', () => {
  expect(run(device, [asset], [device, { ...device, id: 8 }]).state).toBe('conflict');
});
test.each([null, '', ' ', 'N/A', 'na', ' UNKNOWN ', 'NONE', 'NOT AVAILABLE'])('unusable serial %s cannot link', serial_number => {
  expect(run({ ...device, serial_number }).autoLinkAsset).toBeUndefined();
});
test('asset linked elsewhere conflicts', () => {
  expect(run(device, [asset], [device, { ...device, id: 8, serial_number: 'OTHER', asset_id: 40 }]).state).toBe('conflict');
});
test('existing relationship is preserved when serial changes', () => {
  const d = { ...device, asset_id: 40, serial_number: 'NEW' };
  const result = run(d, [asset, { ...asset, id: 41, serial_number: 'NEW' }]);
  expect(result).toMatchObject({ state: 'conflict', asset: { id: 40 } });
  expect(result.autoLinkAsset).toBeUndefined();
  expect(d.asset_id).toBe(40);
});
test('post-link asset serial edit produces conflict with both values', () => {
  const result = run({ ...device, asset_id: 40 }, [{ ...asset, serial_number: 'CHANGED' }]);
  expect(result.state).toBe('conflict');
  expect(result.comparisons[0]).toMatchObject({ state: 'mismatch', asset_value: 'CHANGED', rmm_value: 'ABC' });
});
test('ineligible existing relationship is conflict without exposing asset data', () => {
  expect(run({ ...device, asset_id: 40 }, [{ ...asset, type: 'Monitor' }])).toMatchObject({ state: 'conflict', asset: null, comparisons: [] });
});
test('hostname-only candidate is possible, never linked', () => {
  expect(run({ ...device, serial_number: 'OTHER' })).toMatchObject({ state: 'possible_match', candidates: [asset] });
  expect(run({ ...device, serial_number: 'OTHER' }).autoLinkAsset).toBeUndefined();
});
test('no candidate is unmatched', () => {
  expect(run({ ...device, serial_number: 'OTHER', hostname: 'DIFFERENT' }).state).toBe('unmatched');
});
test('linked comparison reports normalized matches', () => {
  const result = run({ ...device, asset_id: 40 });
  expect(result.state).toBe('linked');
  expect(result.comparisons).toHaveLength(4);
  expect(result.comparisons.every(x => x.state === 'match')).toBe(true);
});
test('linked differences and missing values preserve administrative and observed values', () => {
  const result = run({ ...device, asset_id: 40, hostname: 'NEW', manufacturer: null, model: 'X' }, [{ ...asset, model: null }]);
  expect(result.comparisons).toEqual(expect.arrayContaining([
    expect.objectContaining({ state: 'mismatch', asset_value: 'HOST', rmm_value: 'NEW' }),
    expect.objectContaining({ state: 'missing_in_rmm', asset_value: 'Dell' }),
    expect.objectContaining({ state: 'missing_in_asset', rmm_value: 'X' }),
  ]));
});

describe('transactional correlation', () => {
  let stored, client;
  beforeEach(() => {
    stored = { ...device };
    client = { release: jest.fn(), query: jest.fn(async (sql, params) => {
      if (sql.includes('FROM assets')) return { rows: [{ ...asset }] };
      if (sql.includes('FROM rmm_devices')) return { rows: [{ ...stored }] };
      if (sql.startsWith('UPDATE rmm_devices')) stored.asset_id = params[1];
      return { rows: [] };
    }) };
    pool.connect.mockResolvedValue(client);
  });
  test('automatic runs establish one link and one audit; repeats are idempotent', async () => {
    expect((await correlateDevice(7, { autoLink: true })).state).toBe('linked');
    expect((await correlateDevice(7, { autoLink: true })).state).toBe('linked');
    const calls = client.query.mock.calls;
    expect(calls.filter(([s]) => s.startsWith('UPDATE rmm_devices'))).toHaveLength(1);
    expect(calls.filter(([s]) => s.includes('INSERT INTO rmm_audit_log'))).toHaveLength(1);
    expect(calls.findIndex(([s]) => s.startsWith('LOCK TABLE'))).toBeLessThan(calls.findIndex(([s]) => s.includes('FROM assets')));
    expect(calls.find(([s]) => s.includes('FROM assets'))[0]).toContain("type IN ('Desktop', 'Laptop', 'Server')");
    expect(client.release).toHaveBeenCalledTimes(2);
  });
  test('authenticated inventory check-ins link without a detail request and do not repeat the audit', async () => {
    const request = require('supertest');
    const app = require('../index');
    const token = 'correlation-test-credential';
    const hash = require('crypto').createHash('sha256').update(token).digest('hex');
    pool.query.mockImplementation(async sql => {
      if (sql.includes('WHERE agent_id = $1') && sql.includes('SELECT')) {
        return { rows: [{ id: 7, agent_id: 'test-agent', agent_token_hash: hash }] };
      }
      return { rows: [{ id: 7, status: 'online' }] };
    });
    for (let i = 0; i < 2; i++) {
      const response = await request(app).post('/api/rmm/agent/checkin')
        .set('x-rmm-agent-id', 'test-agent').set('x-rmm-agent-token', token)
        .send({ hostname: 'host', serial_number: 'ABC', manufacturer: 'Dell', model: 'Latitude' });
      expect(response.status).toBe(200);
    }
    expect(stored.asset_id).toBe(40);
    expect(client.query.mock.calls.filter(([s]) => s.includes('INSERT INTO rmm_audit_log'))).toHaveLength(1);
    expect(client.query.mock.calls.filter(([s]) => s.startsWith('UPDATE rmm_devices'))).toHaveLength(1);
  });
  test('detail read never establishes a link or emits audit', async () => {
    expect((await correlateDevice(7)).state).toBe('possible_match');
    expect(client.query).toHaveBeenCalledWith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(client.query.mock.calls.some(([s]) => /^(UPDATE|LOCK)|INSERT INTO/.test(s.trim()))).toBe(false);
  });
  test('audit failure rolls back the relationship transaction', async () => {
    const original = client.query.getMockImplementation();
    client.query.mockImplementation(async (sql, params) => {
      if (sql.includes('INSERT INTO rmm_audit_log')) throw new Error('audit unavailable');
      return original(sql, params);
    });
    await expect(correlateDevice(7, { autoLink: true })).rejects.toThrow('audit unavailable');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});


describe('manufacturer comparison aliases', () => {
  test.each([
    ['Dell', 'Dell Inc.', 'match'],
    ['DELL', 'Dell Inc.', 'match'],
    ['HP', 'Hewlett-Packard', 'match'],
    ['HP', 'Hewlett Packard', 'match'],
    ['HP', 'HP Inc.', 'match'],
    ['Lenovo', 'LENOVO', 'match'],
    ['  Dell  ', ' dell   inc. ', 'match'],
    ['  Example   Systems ', 'example systems', 'match'],
    ['Dell', 'Lenovo', 'mismatch'],
    ['Dell', 'Dell Technologies', 'mismatch'],
    ['Example Inc.', 'Example', 'mismatch'],
  ])('%j vs %j is %s and preserves raw values', (make, manufacturer, state) => {
    const a = { ...asset, make };
    const d = { ...device, asset_id: asset.id, manufacturer };
    const result = run(d, [a]);
    expect(result.comparisons.find(row => row.field === 'Manufacturer')).toEqual({
      field: 'Manufacturer', asset_value: make, rmm_value: manufacturer, state,
    });
    expect(a.make).toBe(make);
    expect(d.manufacturer).toBe(manufacturer);
  });
});
