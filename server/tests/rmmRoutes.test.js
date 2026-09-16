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

    test('admin manually forces an update scan even with a recent snapshot, with audit', async () => {
      const scan = {...job,job_type:'windows_update_scan'};
      pool.query.mockResolvedValueOnce({rows:[{id:10,update_refreshed_at:new Date().toISOString()}]})
        .mockResolvedValueOnce({rows:[scan]}).mockResolvedValueOnce({rows:[{id:1}]});
      const response=await request(app).post(path).set('Authorization','Bearer valid-token')
        .send({job_type:'windows_update_scan',payload:{command:'ignored'},device_id:999});
      expect(response.status).toBe(201);
      expect(response.body.job).toEqual(scan);
      expect(pool.query.mock.calls[1][1]).toEqual([10,'windows_update_scan',1]);
      expect(pool.query.mock.calls[1][0]).toContain("AND status IN ('queued', 'claimed', 'started') DO NOTHING");
      expect(pool.query.mock.calls[2][1]).toContain('Queued windows_update_scan job 52');
    });
    test('manual scan returns conflict when unique active-job guard blocks creation', async () => {
      pool.query.mockResolvedValueOnce({rows:[{id:10}]}).mockResolvedValueOnce({rows:[]});
      const response=await request(app).post(path).set('Authorization','Bearer valid-token').send({job_type:'windows_update_scan'});
      expect(response.status).toBe(409);
      expect(pool.query).toHaveBeenCalledTimes(2);
    });
    test.each(['user','missing','scope'])('scan job preserves %s protection', async protection => {
      if(protection==='user') jwt.verify.mockReturnValue({id:2,role:'user'});
      if(protection==='scope') pool.query.mockResolvedValueOnce({rows:[{id:10,asset_id:9,asset_type:'Truck'}]});
      const req=request(app).post(path);
      if(protection!=='missing') req.set('Authorization','Bearer valid-token');
      const response=await req.send({job_type:'windows_update_scan'});
      expect(response.status).toBe(protection==='user'?403:protection==='missing'?401:400);
      expect(pool.query).toHaveBeenCalledTimes(protection==='scope'?1:0);
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

  describe('hardware inventory check-in', () => {
    const token = 'hardware-test-only';
    function authenticate() {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 10, agent_id: 'hw-agent', hostname: 'HW',
        agent_token_hash: require('crypto').createHash('sha256').update(token).digest('hex') }] });
    }
    function checkin(body) {
      return request(app).post('/api/rmm/agent/checkin').set('x-rmm-agent-id','hw-agent')
        .set('x-rmm-agent-token',token).send(body);
    }
    test('stores update snapshot and JSON with hardware, then preserves omitted update fields', async () => {
      const body = { hostname:'HW', cpu_name:'CPU', update_attempted_at:'2026-09-16T12:00:00Z',
        update_refreshed_at:'2026-09-16T12:00:00Z', update_scan_status:'success', update_pending_count:1,
        update_security_count:1, update_driver_count:0, update_reboot_required:true,
        pending_updates:[{title:'Security update',update_id:'stable-id',revision:2,kb_ids:['123'],categories:['Security Updates'],category_ids:['guid'],severity:'Critical',downloaded:false,installed:false,reboot_may_be_required:true}] };
      for (const payload of [body, {hostname:'HW'}, {hostname:'HW',update_scan_status:'failed',update_attempted_at:'2026-09-16T13:00:00Z'},
        {hostname:'HW',update_pending_count:0,update_security_count:0,update_driver_count:0,update_reboot_required:false,pending_updates:[]},
        {hostname:'HW',update_pending_count:null,update_reboot_required:null,pending_updates:null}]) {
        pool.query.mockReset(); authenticate();
        pool.query.mockResolvedValueOnce({rows:[{id:10,status:'online'}]});
        expect((await checkin(payload)).status).toBe(200);
        const [sql,params] = pool.query.mock.calls[1];
        for (const field of Object.keys(body).filter(key=>key.startsWith('update_')||key==='pending_updates')) {
          const match = sql.match(new RegExp(field+' = \\$([0-9]+)'));
          if (!(field in payload)) expect(match).toBeNull();
          else expect(params[Number(match[1])-1]).toEqual(Array.isArray(payload[field])?JSON.stringify(payload[field]):payload[field]);
        }
        expect(require('../repositories/rmmCorrelationRepository').correlateDevice).toHaveBeenCalledWith(10,{autoLink:true});
      }
    });
    test.each([
      {update_pending_count:-1},{update_pending_count:10001},{update_pending_count:'0'},
      {update_security_count:1.5},{update_driver_count:10001},{update_reboot_required:0},
      {update_reboot_required:'false'},{update_refreshed_at:'yesterday'},{update_scan_status:'ok'},
      {pending_updates:{}},{pending_updates:[null]},{pending_updates:Array(201).fill({})},
      {pending_updates:[{title:'x'.repeat(1001)}]},{pending_updates:[{downloaded:'false'}]},
      {pending_updates:[{kb_ids:Array(33).fill('1')}]},{pending_updates:[{kb_ids:['x'.repeat(33)]}]},
      {pending_updates:[{categories:['x'.repeat(201)]}]},{pending_updates:[{category_ids:Array(33).fill('id')}]},
      {pending_updates:[{severity:'x'.repeat(101)}]},{pending_updates:[{update_id:'x'.repeat(101)}]},
      {pending_updates:[{revision:-1}]},{pending_updates:[{command:'anything'}]},
      {update_pending_count:0,pending_updates:[{}]},{update_pending_count:0,update_security_count:1},
    ])('rejects malformed update telemetry %j', async payload => {
      authenticate();
      expect((await checkin({hostname:'HW',...payload})).status).toBe(400);
      expect(pool.query).toHaveBeenCalledTimes(1);
    });
    test('accepts bounded metadata above default JSON body size', async () => {
      authenticate(); pool.query.mockResolvedValueOnce({rows:[{id:10}]});
      expect((await checkin({hostname:'HW', update_pending_count:10000,update_security_count:10000,
        update_driver_count:10000,pending_updates:Array(200).fill({title:'x'.repeat(1000),
          kb_ids:Array(32).fill('1'),categories:Array(32).fill('category'),category_ids:Array(32).fill('id')})})).status).toBe(200);
    });
    test('disk manufacturer is validated, stored in JSONB and preserved when physical disks are omitted', async () => {
      for (const body of [{physical_disks:[{model:'Disk',manufacturer:'Disk Maker'}]}, {physical_disks:[{manufacturer:null}]}, {}]) {
        pool.query.mockReset(); authenticate(); pool.query.mockResolvedValueOnce({rows:[{id:10}]});
        expect((await checkin({hostname:'HW',...body})).status).toBe(200);
        const [sql,params]=pool.query.mock.calls[1];
        const match=sql.match(/physical_disks = \$([0-9]+)/);
        if (body.physical_disks) expect(JSON.parse(params[Number(match[1])-1])[0].manufacturer).toBe(body.physical_disks[0].manufacturer);
        else expect(match).toBeNull();
      }
    });
    test.each(['x'.repeat(201),{},42])('rejects malformed disk manufacturer %j', async manufacturer => {
      authenticate();
      expect((await checkin({hostname:'HW',physical_disks:[{manufacturer}]})).status).toBe(400);
      expect(pool.query).toHaveBeenCalledTimes(1);
    });
    test('stores CPU, RAM modules, BIOS, UUID, OS boot and disk inventory', async () => {
      authenticate();
      pool.query.mockResolvedValueOnce({ rows: [{ id: 10, status: 'online' }] });
      const body = { hostname:'HW', cpu_manufacturer:'Intel', cpu_name:'Test CPU', processor_count:1,
        core_count:8, logical_processor_count:16, total_memory_bytes:34359738368,
        memory_modules:[{ capacity_bytes:17179869184, manufacturer:'Memory Co', part_number:'PN', speed_mhz:3200, configured_speed_mhz:2933, bank:'BANK 0', locator:'DIMM 1' }],
        bios_manufacturer:'Dell', bios_version:'1.2', bios_release_date:'2025-01-01T00:00:00Z',
        system_uuid:'12345678-1234-1234-1234-123456789abc', os_version:'10.0', os_build:'26100',
        last_boot_at:'2026-09-01T12:00:00Z', uptime_seconds:1234,
        physical_disks:[{ model:'Disk', serial_number:'DISK1', capacity_bytes:1000000000000, media_type:'Fixed hard disk media', bus_type:'SCSI' }] };
      expect((await checkin(body)).status).toBe(200);
      const [sql,params] = pool.query.mock.calls[1];
      for (const key of ['cpu_manufacturer','cpu_name','processor_count','core_count','logical_processor_count','total_memory_bytes','memory_modules','bios_manufacturer','bios_version','bios_release_date','system_uuid','os_build','last_boot_at','uptime_seconds','physical_disks']) {
        const index = Number(sql.match(new RegExp(key + ' = \\$([0-9]+)'))[1]) - 1;
        expect(params[index]).toEqual(Array.isArray(body[key])?JSON.stringify(body[key]):body[key]);
      }
      expect(require('../repositories/rmmCorrelationRepository').correlateDevice).toHaveBeenCalledWith(10,{autoLink:true});
    });
    test('representative wire JSON retains populated hardware through validation, controller and SQL bindings', async () => {
      authenticate();
      pool.query.mockResolvedValueOnce({ rows: [{ id: 10, status: 'online' }] });
      const payload = {
        hostname: 'HW', cpu_manufacturer: 'GenuineIntel', cpu_name: 'Intel(R) Core(TM) Ultra 5 125U',
        processor_count: 1, core_count: 12, logical_processor_count: 14, total_memory_bytes: 16597598208,
        memory_modules: [{ capacity_bytes: 17179869184, manufacturer: 'Test', part_number: 'PN', speed_mhz: 5600, configured_speed_mhz: 5600, bank: 'BANK 0', locator: 'DIMM 0' }],
        bios_manufacturer: 'Dell Inc.', bios_version: '1.2', bios_release_date: '2025-01-01T00:00:00.0000000Z',
        system_uuid: '12345678-1234-1234-1234-123456789abc', os_build: '26100',
        last_boot_at: '2026-01-01T00:00:00.0000000Z', uptime_seconds: 1234,
        physical_disks: [{ model: 'Test disk', serial_number: 'TEST-DISK', capacity_bytes: 512000000000, media_type: 'Fixed hard disk media', bus_type: 'SCSI' }],
      };
      const json = JSON.stringify(payload, null, 4);
      const validated = require('../validation/rmmInventory').validateInventory(JSON.parse(json));
      for (const [key, value] of Object.entries(payload)) {
        if (key !== 'hostname') expect(validated[key]).toEqual(value);
      }
      const response = await request(app).post('/api/rmm/agent/checkin')
        .set('x-rmm-agent-id', 'hw-agent').set('x-rmm-agent-token', token)
        .set('Content-Type', 'application/json').send(json);
      expect(response.status).toBe(200);
      // Explicit parameter order independently verifies the SQL mapping, including arrays.
      expect(pool.query.mock.calls[1][1].slice(11)).toEqual([
        payload.cpu_manufacturer, payload.cpu_name, 1, 12, 14, 16597598208,
        JSON.stringify(payload.memory_modules), payload.bios_manufacturer, payload.bios_version,
        payload.bios_release_date, payload.system_uuid, payload.os_build, payload.last_boot_at,
        1234, JSON.stringify(payload.physical_disks),
      ]);
      expect(require('../repositories/rmmCorrelationRepository').correlateDevice).toHaveBeenCalledWith(10, {autoLink:true});
    });
    test.each([
      {cpu_name:{}}, {core_count:-1}, {processor_count:1.5}, {total_memory_bytes:'32 GB'},
      {last_boot_at:'yesterday'}, {cpu_name:'x'.repeat(301)}, {memory_modules:{}},
      {memory_modules:[null]}, {memory_modules:[{capacity_bytes:-2}]},
      {memory_modules:Array(129).fill({})}, {physical_disks:Array(65).fill({})},
      {physical_disks:[{serial_number:'x'.repeat(201)}]}, {physical_disks:[{bus_type:{}}]},
    ])('rejects malformed or oversized payload %j', async body => {
      authenticate();
      expect((await checkin(body)).status).toBe(400);
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(require('../repositories/rmmCorrelationRepository').correlateDevice).not.toHaveBeenCalled();
    });
    test('validation distinguishes omitted fields from supplied null, zero and empty arrays', () => {
      const { validateInventory } = require('../validation/rmmInventory');
      expect(validateInventory({ hostname: 'HW' })).toEqual({});
      expect(validateInventory({ cpu_name: null, uptime_seconds: 0,
        memory_modules: [], physical_disks: null })).toEqual({
        cpu_name: null, uptime_seconds: 0, memory_modules: [], physical_disks: null,
      });
    });
    test('legacy check-ins preserve hardware and later supplied fields replace only reported inventory', async () => {
      const inventory = {
        cpu_manufacturer: 'Intel', cpu_name: 'Original CPU', processor_count: 1,
        core_count: 8, logical_processor_count: 16, total_memory_bytes: 34359738368,
        bios_manufacturer: 'Dell', bios_version: '1.2', bios_release_date: '2025-01-01T00:00:00Z',
        system_uuid: 'test-uuid', os_build: '26100', last_boot_at: '2026-09-01T00:00:00Z',
        uptime_seconds: 1234, memory_modules: [], physical_disks: [],
      };
      inventory.memory_modules = [{ capacity_bytes: 34359738368, manufacturer: 'Memory Co',
        part_number: 'PN', speed_mhz: 3200, configured_speed_mhz: 3200, bank: '0', locator: 'DIMM 1' }];
      inventory.physical_disks = [{ model: 'Disk', serial_number: 'D1', capacity_bytes: 512000000000,
        media_type: 'SSD', bus_type: 'NVMe' }];

      async function submit(body) {
        authenticate();
        pool.query.mockResolvedValueOnce({ rows: [{ id: 10, status: 'online' }] });
        expect((await checkin(body)).status).toBe(200);
        return pool.query.mock.calls[pool.query.mock.calls.length - 1];
      }
      function expectAssignments([sql, params], supplied) {
        for (const field of Object.keys(inventory)) {
          const assignment = sql.match(new RegExp(`\\b${field} = \\$([0-9]+)(::jsonb)?`));
          if (!Object.prototype.hasOwnProperty.call(supplied, field)) {
            // An omitted column cannot be overwritten by this UPDATE.
            expect(assignment).toBeNull();
            continue;
          }
          expect(assignment).not.toBeNull();
          const value = supplied[field];
          expect(params[Number(assignment[1]) - 1]).toEqual(Array.isArray(value) ? JSON.stringify(value) : value);
          if (Array.isArray(value)) expect(assignment[2]).toBe('::jsonb');
        }
        expect(params).toHaveLength(11 + Object.keys(supplied).length);
      }

      expectAssignments(await submit({ hostname: 'HW', ...inventory }), inventory);
      const legacyUpdate = await submit({ hostname: 'HW', agent_version: 'legacy' });
      expectAssignments(legacyUpdate, {});
      expect(legacyUpdate[0]).toContain('os_name = $3');
      expect(legacyUpdate[1][2]).toBeNull();
      expect(legacyUpdate[1][8]).toBe('legacy');

      const scalars = { cpu_name: 'Replacement CPU', total_memory_bytes: 68719476736,
        bios_version: '2.0', uptime_seconds: 0 };
      expectAssignments(await submit(scalars), scalars);
      const arrays = {
        memory_modules: [{ ...inventory.memory_modules[0], capacity_bytes: 68719476736 }],
        physical_disks: [{ ...inventory.physical_disks[0], serial_number: 'D2' }],
      };
      expectAssignments(await submit(arrays), arrays);
      const emptyArrays = { memory_modules: [], physical_disks: [] };
      expectAssignments(await submit(emptyArrays), emptyArrays);
      const cleared = { cpu_name: null, memory_modules: null, physical_disks: null };
      expectAssignments(await submit(cleared), cleared);
    });
    test('missing optional hardware still checks in without hardware update parameters', async () => {
      authenticate(); pool.query.mockResolvedValueOnce({ rows:[{id:10,status:'online'}] });
      expect((await checkin({hostname:'HW'})).status).toBe(200);
      expect(pool.query.mock.calls[1][1]).toHaveLength(11);
    });
    test('accepts array count limits and discards unknown module properties', async () => {
      authenticate(); pool.query.mockResolvedValueOnce({ rows:[{id:10,status:'online'}] });
      expect((await checkin({memory_modules:Array(128).fill({capacity_bytes:1024,unexpected:'ignored'}),physical_disks:Array(64).fill({})})).status).toBe(200);
      expect(pool.query.mock.calls[1][1].some(x=>typeof x==='string'&&x.includes('unexpected'))).toBe(false);
    });
  });

});
