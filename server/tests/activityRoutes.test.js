const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

jest.mock('jsonwebtoken');
jest.mock('../db/pool', () => ({
  query: jest.fn(),
}));

const app = require('../index');

describe('Activity routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jwt.verify.mockReturnValue({
      id: 7,
      username: 'tester',
      role: 'admin',
    });
  });

  test('GET /api/activity returns recent activity', async () => {
    const activity = [
      {
        id: 2,
        user_id: 7,
        username: 'tester',
        action: 'ADD_ASSET',
        details: 'Added asset MBS-100',
      },
      {
        id: 1,
        user_id: 7,
        username: 'tester',
        action: 'LOGIN',
        details: 'User logged in',
      },
    ];

    pool.query.mockResolvedValueOnce({ rows: activity });

    const response = await request(app)
      .get('/api/activity')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(activity);

    expect(pool.query).toHaveBeenCalledWith(
      `SELECT a.*, u.username FROM activity_log a
     JOIN users u ON a.user_id = u.id
     ORDER BY a.created_at DESC LIMIT 100`
    );
  });

  test('activity route rejects requests without authentication', async () => {
    const response = await request(app).get('/api/activity');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'No token' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('activity route rejects authenticated non-admin users', async () => {
    jwt.verify.mockReturnValue({
      id: 8,
      username: 'normaluser',
      role: 'user',
    });

    const response = await request(app)
      .get('/api/activity')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Admin only' });
    expect(pool.query).not.toHaveBeenCalled();
  });
});
