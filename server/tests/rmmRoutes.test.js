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
});
