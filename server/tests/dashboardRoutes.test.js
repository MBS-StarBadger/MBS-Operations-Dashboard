const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

jest.mock('jsonwebtoken');
jest.mock('../db/pool', () => ({
  query: jest.fn(),
}));

const app = require('../index');

describe('Dashboard routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jwt.verify.mockReturnValue({
      id: 7,
      username: 'tester',
      role: 'admin',
    });
  });

  test('GET /api/dashboard returns dashboard summary', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: 100 }] })
      .mockResolvedValueOnce({ rows: [{ count: 70 }] })
      .mockResolvedValueOnce({ rows: [{ count: 20 }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 1, name: 'Gloves', quantity: 1, low_at: 2 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 2, color: 'Black', size: 'L', quantity: 2 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 3,
            action: 'ADD_ASSET',
            details: 'Added asset MBS-100',
            username: 'tester',
          },
        ],
      });

    const response = await request(app)
      .get('/api/dashboard')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      assets: {
        total: 100,
        assigned: 70,
        available: 20,
      },
      alerts: {
        lowConsumables: [
          { id: 1, name: 'Gloves', quantity: 1, low_at: 2 },
        ],
        lowShirts: [
          { id: 2, color: 'Black', size: 'L', quantity: 2 },
        ],
      },
      recentActivity: [
        {
          id: 3,
          action: 'ADD_ASSET',
          details: 'Added asset MBS-100',
          username: 'tester',
        },
      ],
    });

    expect(pool.query).toHaveBeenCalledTimes(6);
  });

  test('dashboard route rejects requests without authentication', async () => {
    const response = await request(app).get('/api/dashboard');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'No token' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('dashboard route returns 500 when a dashboard query fails', async () => {
    pool.query.mockRejectedValueOnce(
      new Error('database unavailable')
    );

    const response = await request(app)
      .get('/api/dashboard')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Unable to load dashboard',
    });
  });
});
