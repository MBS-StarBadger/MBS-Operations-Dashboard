const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

jest.mock('jsonwebtoken');
jest.mock('bcryptjs');
jest.mock('../db/pool', () => ({
  query: jest.fn(),
}));

const app = require('../index');

describe('User routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jwt.verify.mockReturnValue({
      id: 7,
      username: 'tester',
      role: 'admin',
    });

    bcrypt.hash.mockResolvedValue('hashed-password');
  });

  test('GET /api/users returns all users', async () => {
    const users = [
      { id: 1, username: 'admin', role: 'admin' },
      { id: 2, username: 'user1', role: 'user' },
    ];

    pool.query.mockResolvedValueOnce({ rows: users });

    const response = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(users);

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT id, username, role, created_at FROM users ORDER BY id'
    );
  });

  test('POST /api/users creates a user with a hashed password', async () => {
    const createdUser = {
      id: 3,
      username: 'newuser',
      role: 'user',
    };

    pool.query.mockResolvedValueOnce({ rows: [createdUser] });

    const response = await request(app)
      .post('/api/users')
      .set('Authorization', 'Bearer valid-token')
      .send({
        username: 'newuser',
        password: 'plain-password',
        role: '',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(createdUser);

    expect(bcrypt.hash).toHaveBeenCalledWith(
      'plain-password',
      10
    );

    expect(pool.query).toHaveBeenCalledWith(
      'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
      ['newuser', 'hashed-password', 'user']
    );
  });

  test('PUT /api/users/:id/password updates password', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .put('/api/users/5/password')
      .set('Authorization', 'Bearer valid-token')
      .send({
        password: 'new-password',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    expect(bcrypt.hash).toHaveBeenCalledWith(
      'new-password',
      10
    );

    expect(pool.query).toHaveBeenCalledWith(
      'UPDATE users SET password = $1 WHERE id = $2',
      ['hashed-password', '5']
    );
  });

  test('user routes reject requests without authentication', async () => {
    const response = await request(app).get('/api/users');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'No token' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('user routes reject authenticated non-admin users', async () => {
    jwt.verify.mockReturnValue({
      id: 8,
      username: 'normaluser',
      role: 'user',
    });

    const response = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Admin only' });
    expect(pool.query).not.toHaveBeenCalled();
  });
});
