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

  test('GET /api/rmm allows admins', async () => {
    jwt.verify.mockReturnValue({
      id: 1,
      username: 'admin-user',
      role: 'admin',
    });

    pool.query.mockResolvedValueOnce({
      rows: [{
        total: 0,
        online: 0,
        offline: 0,
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
});
