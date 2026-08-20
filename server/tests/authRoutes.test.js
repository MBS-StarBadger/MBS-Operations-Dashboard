const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('../db/pool', () => ({
  query: jest.fn(),
}));

const app = require('../index');

describe('Auth routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jwt.sign.mockReturnValue('signed-test-token');
  });

  test('POST /api/login returns token and user for valid credentials', async () => {
    const user = {
      id: 7,
      username: 'tester',
      password: 'stored-hash',
      role: 'admin',
    };

    pool.query.mockResolvedValueOnce({ rows: [user] });
    bcrypt.compare.mockResolvedValueOnce(true);

    const response = await request(app)
      .post('/api/login')
      .send({
        username: 'tester',
        password: 'correct-password',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      token: 'signed-test-token',
      user: {
        id: 7,
        username: 'tester',
        role: 'admin',
      },
    });

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT * FROM users WHERE username = $1',
      ['tester']
    );

    expect(bcrypt.compare).toHaveBeenCalledWith(
      'correct-password',
      'stored-hash'
    );

    expect(jwt.sign).toHaveBeenCalledWith(
      {
        id: 7,
        username: 'tester',
        role: 'admin',
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
  });

  test('POST /api/login rejects an incorrect password', async () => {
    const user = {
      id: 7,
      username: 'tester',
      password: 'stored-hash',
      role: 'admin',
    };

    pool.query.mockResolvedValueOnce({ rows: [user] });
    bcrypt.compare.mockResolvedValueOnce(false);

    const response = await request(app)
      .post('/api/login')
      .send({
        username: 'tester',
        password: 'wrong-password',
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'Invalid credentials',
    });

    expect(jwt.sign).not.toHaveBeenCalled();
  });

  test('POST /api/login rejects an unknown user', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .post('/api/login')
      .send({
        username: 'missing-user',
        password: 'password',
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'Invalid credentials',
    });

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  test('POST /api/login returns 500 when user lookup fails', async () => {
    pool.query.mockRejectedValueOnce(
      new Error('database unavailable')
    );

    const response = await request(app)
      .post('/api/login')
      .send({
        username: 'tester',
        password: 'password',
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'database unavailable',
    });

    expect(jwt.sign).not.toHaveBeenCalled();
  });
});
