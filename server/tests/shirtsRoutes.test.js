const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

jest.mock('jsonwebtoken');
jest.mock('../db/pool', () => ({
  query: jest.fn(),
}));

const app = require('../index');

describe('Shirt routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jwt.verify.mockReturnValue({
      id: 7,
      username: 'tester',
      role: 'admin',
    });
  });

  test('GET /api/shirts returns all shirts', async () => {
    const shirts = [
      { id: 1, color: 'Black', size: 'M', quantity: 10 },
      { id: 2, color: 'Black', size: 'L', quantity: 8 },
    ];

    pool.query.mockResolvedValueOnce({ rows: shirts });

    const response = await request(app)
      .get('/api/shirts')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(shirts);

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT * FROM shirts ORDER BY color, CASE size WHEN \'S\' THEN 1 WHEN \'M\' THEN 2 WHEN \'L\' THEN 3 WHEN \'XL\' THEN 4 WHEN \'2XL\' THEN 5 END'
    );
  });

  test('PUT /api/shirts/:id updates shirt quantity', async () => {
    const updatedShirt = {
      id: 5,
      color: 'Blue',
      size: 'XL',
      quantity: 12,
    };

    pool.query.mockResolvedValueOnce({ rows: [updatedShirt] });

    const response = await request(app)
      .put('/api/shirts/5')
      .set('Authorization', 'Bearer valid-token')
      .send({ quantity: '12' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(updatedShirt);

    expect(pool.query).toHaveBeenCalledWith(
      'UPDATE shirts SET quantity=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [12, '5']
    );
  });

  test('PUT /api/shirts/:id prevents negative quantity', async () => {
    const updatedShirt = {
      id: 5,
      color: 'Blue',
      size: 'XL',
      quantity: 0,
    };

    pool.query.mockResolvedValueOnce({ rows: [updatedShirt] });

    const response = await request(app)
      .put('/api/shirts/5')
      .set('Authorization', 'Bearer valid-token')
      .send({ quantity: '-10' });

    expect(response.status).toBe(200);

    expect(pool.query).toHaveBeenCalledWith(
      'UPDATE shirts SET quantity=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [0, '5']
    );
  });

  test('shirt routes reject requests without authentication', async () => {
    const response = await request(app).get('/api/shirts');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'No token' });
    expect(pool.query).not.toHaveBeenCalled();
  });
});
