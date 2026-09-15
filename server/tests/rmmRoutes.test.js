const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

jest.mock('jsonwebtoken');
jest.mock('../repositories/rmmCorrelationRepository', () => ({
  correlateDevice: jest.fn().mockResolvedValue(undefined),
}));
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

  test('GET /api/rmm/devices/:id returns device details for admins', async () => {
    jwt.verify.mockReturnValue({
      id: 1,
      username: 'admin-user',
      role: 'admin',
    });

    const device = {
      id: 3,
      asset_id: null,
      agent_id: 'agent-lt226',
      hostname: 'MBS-LT226',
      os_name: 'Microsoft Windows 11 Pro',
      os_version: '10.0.26200',
      architecture: '64-bit',
      serial_number: '85Q1D54',
      ip_address: '10.0.2.93',
      logged_in_user: 'MBS-LT226\\mbsit',
      agent_version: '0.1.0',
      health_status: 'online',
      seconds_since_seen: 23,
      asset_tag: null,
      asset_name: null,
      assigned_to: null,
    };

    pool.query.mockResolvedValueOnce({
      rows: [device],
    });

    const response = await request(app)
      .get('/api/rmm/devices/3')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(device);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE d.id = $1'),
      [3]
    );
  });

  test('GET /api/rmm/devices/:id returns 404 when device does not exist', async () => {
    jwt.verify.mockReturnValue({
      id: 1,
      username: 'admin-user',
      role: 'admin',
    });

    pool.query.mockResolvedValueOnce({
      rows: [],
    });

    const response = await request(app)
      .get('/api/rmm/devices/9999')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'RMM device not found',
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE d.id = $1'),
      [9999]
    );
  });

  test('GET /api/rmm/devices/:id rejects non-admin users', async () => {
    jwt.verify.mockReturnValue({
      id: 2,
      username: 'standard-user',
      role: 'user',
    });

    const response = await request(app)
      .get('/api/rmm/devices/3')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Admin only',
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
        manufacturer: 'Dell',
        model: 'Latitude',
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
    expect(updateParams[9]).toBe('Dell');
    expect(updateParams[10]).toBe('Latitude');
    expect(updateSql).toContain('manufacturer = $10');
    expect(updateSql).toContain('model = $11');
    expect(require('../repositories/rmmCorrelationRepository').correlateDevice).toHaveBeenCalledWith(10, { autoLink: true });
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

  test.each([
    ['a queued job', {
      id: 42,
      device_id: 10,
      job_type: 'inventory',
      payload: {},
      status: 'claimed',
      created_at: '2026-09-15T13:00:00.000Z',
      claimed_at: '2026-09-15T13:01:00.000Z',
    }],
    ['no queued job', null],
  ])('GET /api/rmm/agent/jobs/next returns %s for an authenticated agent', async (_, job) => {
    const crypto = require('crypto');
    const token = 'd'.repeat(64);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 10,
          agent_id: 'agent-123',
          hostname: 'MBS-TEST-001',
          agent_token_hash: tokenHash,
        }],
      })
      .mockResolvedValueOnce({ rows: job ? [job] : [] });

    const response = await request(app)
      .get('/api/rmm/agent/jobs/next')
      .set('x-rmm-agent-id', 'agent-123')
      .set('x-rmm-agent-token', token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', job });
    expect(jwt.verify).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE agent_id = $1'),
      ['agent-123']
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE rmm_jobs'),
      [10]
    );
  });

  test('GET /api/rmm/agent/jobs/next rejects missing agent credentials', async () => {
    const response = await request(app)
      .get('/api/rmm/agent/jobs/next');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Agent credentials required' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('GET /api/rmm/agent/jobs/next returns 500 when claiming a job fails', async () => {
    const crypto = require('crypto');
    const token = 'e'.repeat(64);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const error = new Error('Job query failed');
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});

    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 10,
          agent_id: 'agent-123',
          hostname: 'MBS-TEST-001',
          agent_token_hash: tokenHash,
        }],
      })
      .mockRejectedValueOnce(error);

    try {
      const response = await request(app)
        .get('/api/rmm/agent/jobs/next')
        .set('x-rmm-agent-id', 'agent-123')
        .set('x-rmm-agent-token', token);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Unable to retrieve RMM job' });
      expect(log).toHaveBeenCalledWith('RMM agent job poll failed:', error);
    } finally {
      log.mockRestore();
    }
  });

  describe('POST /api/rmm/agent/jobs/:jobId/result', () => {
    const token = 'f'.repeat(64);
    const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');

    function authenticate() {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 10, agent_id: 'agent-123', agent_token_hash: tokenHash }],
      });
    }

    function report(body, jobId = '42') {
      return request(app)
        .post(`/api/rmm/agent/jobs/${jobId}/result`)
        .set('x-rmm-agent-id', 'agent-123')
        .set('x-rmm-agent-token', token)
        .send(body);
    }

    test.each(['started', 'completed', 'failed'])('accepts a valid %s transition', async (status) => {
      authenticate();
      const body = {
        status,
        result_code: status === 'failed' ? 1 : 0,
        result_output: 'Inventory refresh result',
        result_error: status === 'failed' ? 'Inventory collection failed' : null,
      };
      const job = { id: 42, device_id: 10, ...body };
      pool.query.mockResolvedValueOnce({ rows: [job] });

      const response = await report({ ...body, device_id: 999 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok', job });
      expect(jwt.verify).not.toHaveBeenCalled();
      expect(pool.query).toHaveBeenCalledTimes(2);
      const [sql, params] = pool.query.mock.calls[1];
      expect(params).toEqual([42, 10, status, body.result_code, body.result_output, body.result_error]);
      expect(sql).toContain('WHERE id = $1 AND device_id = $2');
      expect(sql).toContain("($3 = 'started' AND status = 'claimed')");
      expect(sql).toContain("($3 = 'completed' AND status = 'started')");
      expect(sql).toContain("($3 = 'failed' AND status IN ('claimed', 'started'))");
      expect(sql).toContain("started_at = CASE WHEN $3 = 'started' THEN NOW() ELSE started_at END");
      expect(sql).toContain("completed_at = CASE WHEN $3 IN ('completed', 'failed') THEN NOW() ELSE completed_at END");
    });

    test.each(['another device job', 'nonexistent job'])('returns 404 for %s', async () => {
      authenticate();
      // Neither a foreign job nor a missing job matches either device-scoped query.
      pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
      const response = await report({ status: 'started', device_id: 999 });
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'RMM job not found' });
      expect(pool.query.mock.calls[1][0]).toContain('WHERE id = $1 AND device_id = $2');
      expect(pool.query.mock.calls[1][1]).toEqual([42, 10, 'started', null, null, null]);
      expect(pool.query).toHaveBeenNthCalledWith(3,
        'SELECT id FROM rmm_jobs WHERE id = $1 AND device_id = $2', [42, 10]);
    });

    test('rejects an invalid state transition', async () => {
      authenticate();
      pool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 42 }] });
      const response = await report({ status: 'completed' });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid RMM job status transition' });
    });

    test.each([
      [{ status: 'queued' }, '42'],
      [{ status: 'started' }, 'abc'],
      [{ status: 'started' }, '0'],
      [{ status: 'started', result_code: '0' }, '42'],
      [{ status: 'started', result_code: 2147483648 }, '42'],
      [{ status: 'completed', result_output: {} }, '42'],
      [{ status: 'failed', result_error: [] }, '42'],
    ])('rejects invalid input %j for job %s', async (body, jobId) => {
      authenticate();
      const response = await report(body, jobId);
      expect(response.status).toBe(400);
      expect(response.body.error).toEqual(expect.any(String));
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test('rejects missing agent credentials', async () => {
      const response = await request(app).post('/api/rmm/agent/jobs/42/result').send({ status: 'started' });
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Agent credentials required' });
      expect(pool.query).not.toHaveBeenCalled();
    });

    test('returns 500 on a repository failure', async () => {
      authenticate();
      const error = new Error('Database unavailable');
      pool.query.mockRejectedValueOnce(error);
      const log = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const response = await report({ status: 'started' });
        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: 'Unable to report RMM job result' });
        expect(log).toHaveBeenCalledWith('RMM agent job result failed:', error);
      } finally {
        log.mockRestore();
      }
    });
  });

  describe('admin device jobs', () => {
    const path = '/api/rmm/devices/10/jobs';
    const job = { id: 52, device_id: 10, job_type: 'inventory_refresh', status: 'queued', created_by: 1 };
    beforeEach(() => {
      jwt.verify.mockReturnValue({ id: 1, username: 'admin-user', role: 'admin' });
    });

    test('admin creates a queued inventory job using URL device and authenticated user, and writes audit', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 10 }] })
        .mockResolvedValueOnce({ rows: [job] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const response = await request(app).post(path).set('Authorization', 'Bearer valid-token')
        .send({ job_type: 'inventory_refresh', device_id: 999, created_by: 999, payload: { command: 'ignored' } });
      expect(response.status).toBe(201);
      expect(response.body).toEqual({ status: 'ok', job });
      expect(pool.query.mock.calls[0][1]).toEqual([10]);
      expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining("VALUES ($1, $2, 'queued', $3)"), [10, 'inventory_refresh', 1]);
      expect(pool.query).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO rmm_audit_log'), [
        1, 10, 'RMM_JOB_CREATED', 'success', 'Queued inventory_refresh job 52', expect.any(String), false, null,
      ]);
      expect(pool.query).toHaveBeenCalledTimes(3);
    });

    test('cannot queue management jobs for an out-of-scope linked asset', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 10, asset_id: 99, asset_type: null }] });
      const response = await request(app).post(path).set('Authorization', 'Bearer valid-token')
        .send({ job_type: 'inventory_refresh' });
      expect(response.status).toBe(400);
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test('admin retrieves newest device-scoped job history including lifecycle fields', async () => {
      const jobs = [{ ...job, claimed_at: null, started_at: null, completed_at: null,
        created_at: '2026-09-15T13:00:00.000Z', result_code: null, result_output: null, result_error: null, username: 'admin-user' }];
      pool.query.mockResolvedValueOnce({ rows: [{ id: 10 }] }).mockResolvedValueOnce({ rows: jobs });
      const response = await request(app).get(path).set('Authorization', 'Bearer valid-token');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok', jobs });
      expect(pool.query.mock.calls[0][1]).toEqual([10]);
      const [sql,params] = pool.query.mock.calls[1];
      expect(params).toEqual([10]);
      expect(sql).toContain('WHERE j.device_id = $1');
      expect(sql).toContain('ORDER BY j.created_at DESC, j.id DESC');
      expect(sql).toContain('LIMIT 25');
      for (const field of ['claimed_at', 'started_at', 'completed_at', 'result_code', 'result_output', 'result_error', 'created_by']) {
        expect(sql).toContain(`j.${field}`);
      }
      expect(sql).toContain('u.username');
    });

    test.each(['post', 'get'])('%s rejects non-admin access', async (method) => {
      jwt.verify.mockReturnValue({ id: 2, role: 'user' });
      const response = await request(app)[method](path).set('Authorization', 'Bearer valid-token').send({ job_type: 'inventory_refresh' });
      expect(response.status).toBe(403);
      expect(pool.query).not.toHaveBeenCalled();
    });

    test.each(['post', 'get'])('%s rejects unauthenticated access', async (method) => {
      const response = await request(app)[method](path).send({ job_type: 'inventory_refresh' });
      expect(response.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
    });

    test.each(['reboot', 'powershell', '', null, ['inventory_refresh']])('rejects unsupported job type %j', async (jobType) => {
      const response = await request(app).post(path).set('Authorization', 'Bearer valid-token').send({ job_type: jobType });
      expect(response.status).toBe(400);
      expect(pool.query).not.toHaveBeenCalled();
    });

    test.each(['post', 'get'])('%s returns 404 for missing device', async (method) => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const response = await request(app)[method](path).set('Authorization', 'Bearer valid-token').send({ job_type: 'inventory_refresh' });
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'RMM device not found' });
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test.each(['post', 'get'])('%s rejects malformed device IDs', async (method) => {
      for (const id of ['0', '-1', '10abc', '1.5', '2147483648']) {
        const response = await request(app)[method](`/api/rmm/devices/${id}/jobs`).set('Authorization', 'Bearer valid-token').send({ job_type: 'inventory_refresh' });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Invalid device ID' });
      }
      expect(pool.query).not.toHaveBeenCalled();
    });

    test.each(['post', 'get'])('%s returns 500 on repository failure', async (method) => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 10 }] }).mockRejectedValueOnce(new Error('Database unavailable'));
      const log = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const response = await request(app)[method](path).set('Authorization', 'Bearer valid-token').send({ job_type: 'inventory_refresh' });
        expect(response.status).toBe(500);
        expect(response.body.error).toBe(method === 'post' ? 'Unable to create RMM job' : 'Unable to load RMM job history');
      } finally { log.mockRestore(); }
    });

    test('audit failure preserves successful creation following the existing audit pattern', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 10 }] }).mockResolvedValueOnce({ rows: [job] })
        .mockRejectedValueOnce(new Error('Audit unavailable'));
      const log = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const response = await request(app).post(path).set('Authorization', 'Bearer valid-token').send({ job_type: 'inventory_refresh' });
        expect(response.status).toBe(201);
        expect(log).toHaveBeenCalledWith('RMM job creation audit failed:', expect.any(Error));
      } finally { log.mockRestore(); }
    });
  });

});
