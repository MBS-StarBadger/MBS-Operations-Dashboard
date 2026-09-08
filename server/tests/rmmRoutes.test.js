const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

jest.mock('jsonwebtoken');
jest.mock('../db/pool', () => ({
  query: jest.fn(),
}));

const app = require('../index');

describe('RMM routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/rmm allows admins and writes audit event', async () => {
    jwt.verify.mockReturnValue({
      id: 1,
      username: 'admin-user',
      role: 'admin',
    });

    // Summary query
    pool.query.mockResolvedValueOnce({
      rows: [{
        total: 0,
        online: 0,
        offline: 0,
      }],
    });

    // Audit INSERT
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: 1,
        user_id: 1,
        device_id: null,
        action: 'RMM_VIEWED',
        result: 'success',
      }],
    });

    const response = await request(app)
      .get('/api/rmm')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      module: 'rmm',
      status: 'ready',
      devices: {
        total: 0,
        online: 0,
        offline: 0,
        alerts: 0,
      },
    });

    expect(pool.query).toHaveBeenCalledTimes(2);

    expect(pool.query.mock.calls[1][0]).toEqual(
      expect.stringContaining('INSERT INTO rmm_audit_log')
    );
  });

  test('GET /api/rmm rejects non-admin users', async () => {
    jwt.verify.mockReturnValue({
      id: 2,
      username: 'standard-user',
      role: 'user',
    });

    const response = await request(app)
      .get('/api/rmm')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Admin only',
    });

    expect(pool.query).not.toHaveBeenCalled();
  });

  test('GET /api/rmm rejects unauthenticated requests', async () => {
    const response = await request(app)
      .get('/api/rmm');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'No token',
    });

    expect(pool.query).not.toHaveBeenCalled();
  });

  test('GET /api/rmm/devices returns managed devices for admins', async () => {
    jwt.verify.mockReturnValue({
      id: 1,
      username: 'admin-user',
      role: 'admin',
    });

    const devices = [
      {
        id: 1,
        agent_id: 'agent-test-001',
        hostname: 'MBS-LT-001',
        status: 'online',
        asset_tag: 'MBS-0001',
      },
    ];

    pool.query.mockResolvedValueOnce({
      rows: devices,
    });

    const response = await request(app)
      .get('/api/rmm/devices')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(devices);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM rmm_devices d')
    );
  });

  test('GET /api/rmm/devices rejects non-admin users', async () => {
    jwt.verify.mockReturnValue({
      id: 2,
      username: 'standard-user',
      role: 'user',
    });

    const response = await request(app)
      .get('/api/rmm/devices')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Admin only',
    });

    expect(pool.query).not.toHaveBeenCalled();
  });

  test('GET /api/rmm/devices rejects unauthenticated requests', async () => {
    const response = await request(app)
      .get('/api/rmm/devices');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'No token',
    });

    expect(pool.query).not.toHaveBeenCalled();
  });

  test('GET /api/rmm/audit returns audit entries for admins', async () => {
    jwt.verify.mockReturnValue({
      id: 1,
      username: 'admin-user',
      role: 'admin',
    });

    const auditRows = [
      {
        id: 1,
        action: 'RMM_VIEWED',
        result: 'success',
        details: 'Opened RMM dashboard',
        source_ip: '10.0.0.42',
        mfa_verified: false,
        correlation_id: 'test-correlation',
        created_at: '2026-08-21T16:00:00.000Z',
        username: 'admin-user',
        hostname: null,
        agent_id: null,
      },
    ];

    pool.query.mockResolvedValueOnce({
      rows: auditRows,
    });

    const response = await request(app)
      .get('/api/rmm/audit')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(auditRows);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM rmm_audit_log l'),
      [100]
    );
  });

  test('GET /api/rmm/audit rejects non-admin users', async () => {
    jwt.verify.mockReturnValue({
      id: 2,
      username: 'standard-user',
      role: 'user',
    });

    const response = await request(app)
      .get('/api/rmm/audit')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Admin only',
    });

    expect(pool.query).not.toHaveBeenCalled();
  });

  test('GET /api/rmm/audit rejects unauthenticated requests', async () => {
    const response = await request(app)
      .get('/api/rmm/audit');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'No token',
    });

    expect(pool.query).not.toHaveBeenCalled();
  });

  test('POST /api/rmm/enroll allows admins and returns one-time credentials', async () => {
    jwt.verify.mockReturnValue({
      id: 1,
      username: 'admin-user',
      role: 'admin',
    });

    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 10,
          agent_id: 'generated-agent-id',
          hostname: 'MBS-TEST-001',
          status: 'offline',
          created_at: '2026-09-08T13:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 25,
          user_id: 1,
          device_id: 10,
          action: 'RMM_DEVICE_ENROLLED',
          result: 'success',
        }],
      });

    const response = await request(app)
      .post('/api/rmm/enroll')
      .set('Authorization', 'Bearer valid-token')
      .send({ hostname: 'MBS-TEST-001' });

    expect(response.status).toBe(201);
    expect(response.body.device.hostname).toBe('MBS-TEST-001');
    expect(response.body.device.status).toBe('offline');

    expect(response.body.credentials.agent_id).toEqual(expect.any(String));
    expect(response.body.credentials.token).toMatch(/^[a-f0-9]{64}$/);

    expect(pool.query).toHaveBeenCalledTimes(2);

    const [, enrollmentParams] = pool.query.mock.calls[0];
    const [auditSql, auditParams] = pool.query.mock.calls[1];

    expect(enrollmentParams[1]).toBe('MBS-TEST-001');
    expect(enrollmentParams[2]).toMatch(/^[a-f0-9]{64}$/);

    // We store the SHA-256 hash, never the plaintext token.
    expect(enrollmentParams[2]).not.toBe(response.body.credentials.token);

    expect(auditSql).toContain('INSERT INTO rmm_audit_log');
    expect(auditParams[0]).toBe(1);
    expect(auditParams[1]).toBe(10);
    expect(auditParams[2]).toBe('RMM_DEVICE_ENROLLED');
    expect(auditParams[3]).toBe('success');
  });

  test('POST /api/rmm/enroll requires a hostname', async () => {
    jwt.verify.mockReturnValue({
      id: 1,
      username: 'admin-user',
      role: 'admin',
    });

    const response = await request(app)
      .post('/api/rmm/enroll')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Hostname is required',
    });

    expect(pool.query).not.toHaveBeenCalled();
  });

  test('POST /api/rmm/enroll rejects non-admin users', async () => {
    jwt.verify.mockReturnValue({
      id: 2,
      username: 'standard-user',
      role: 'user',
    });

    const response = await request(app)
      .post('/api/rmm/enroll')
      .set('Authorization', 'Bearer valid-token')
      .send({ hostname: 'MBS-TEST-001' });

    expect(response.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('POST /api/rmm/enroll rejects unauthenticated requests', async () => {
    const response = await request(app)
      .post('/api/rmm/enroll')
      .send({ hostname: 'MBS-TEST-001' });

    expect(response.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });


  test('POST /api/rmm/agent/checkin accepts valid agent credentials', async () => {
    const crypto = require('crypto');

    const token = 'a'.repeat(64);
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 10,
          agent_id: 'agent-123',
          hostname: 'MBS-TEST-001',
          agent_token_hash: tokenHash,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 10,
          agent_id: 'agent-123',
          hostname: 'MBS-TEST-001',
          status: 'online',
          last_seen: '2026-09-08T13:00:00.000Z',
        }],
      });

    const response = await request(app)
      .post('/api/rmm/agent/checkin')
      .set('x-rmm-agent-id', 'agent-123')
      .set('x-rmm-agent-token', token)
      .send({
        hostname: 'MBS-TEST-001',
        os_name: 'Windows',
        os_version: '11 Pro',
        architecture: 'x64',
        serial_number: 'ABC123',
        ip_address: '10.0.0.50',
        logged_in_user: 'rcooper',
        agent_version: '0.1.0',
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.device.status).toBe('online');

    expect(pool.query).toHaveBeenCalledTimes(2);

    const [lookupSql, lookupParams] = pool.query.mock.calls[0];
    const [updateSql, updateParams] = pool.query.mock.calls[1];

    expect(lookupSql).toContain('WHERE agent_id = $1');
    expect(lookupParams).toEqual(['agent-123']);

    expect(updateSql).toContain("status = 'online'");
    expect(updateParams[0]).toBe('agent-123');
    expect(updateParams[1]).toBe('MBS-TEST-001');
    expect(updateParams[2]).toBe('Windows');
    expect(updateParams[3]).toBe('11 Pro');
    expect(updateParams[4]).toBe('x64');
    expect(updateParams[5]).toBe('ABC123');
    expect(updateParams[6]).toBe('10.0.0.50');
    expect(updateParams[7]).toBe('rcooper');
    expect(updateParams[8]).toBe('0.1.0');
  });

  test('POST /api/rmm/agent/checkin rejects wrong agent token', async () => {
    const crypto = require('crypto');

    const realToken = 'b'.repeat(64);
    const tokenHash = crypto
      .createHash('sha256')
      .update(realToken)
      .digest('hex');

    pool.query.mockResolvedValueOnce({
      rows: [{
        id: 10,
        agent_id: 'agent-123',
        hostname: 'MBS-TEST-001',
        agent_token_hash: tokenHash,
      }],
    });

    const response = await request(app)
      .post('/api/rmm/agent/checkin')
      .set('x-rmm-agent-id', 'agent-123')
      .set('x-rmm-agent-token', 'wrong-token')
      .send({ hostname: 'MBS-TEST-001' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'Invalid agent credentials',
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('POST /api/rmm/agent/checkin rejects unknown agent', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [],
    });

    const response = await request(app)
      .post('/api/rmm/agent/checkin')
      .set('x-rmm-agent-id', 'missing-agent')
      .set('x-rmm-agent-token', 'some-token')
      .send({ hostname: 'UNKNOWN-PC' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'Invalid agent credentials',
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('POST /api/rmm/agent/checkin rejects missing agent credentials', async () => {
    const response = await request(app)
      .post('/api/rmm/agent/checkin')
      .send({ hostname: 'MBS-TEST-001' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'Agent credentials required',
    });

    expect(pool.query).not.toHaveBeenCalled();
  });

  test('POST /api/rmm/agent/checkin requires hostname when none exists', async () => {
    const crypto = require('crypto');

    const token = 'c'.repeat(64);
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    pool.query.mockResolvedValueOnce({
      rows: [{
        id: 10,
        agent_id: 'agent-123',
        hostname: '',
        agent_token_hash: tokenHash,
      }],
    });

    const response = await request(app)
      .post('/api/rmm/agent/checkin')
      .set('x-rmm-agent-id', 'agent-123')
      .set('x-rmm-agent-token', token)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Hostname is required',
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
  });

});
