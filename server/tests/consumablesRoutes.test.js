const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

jest.mock('jsonwebtoken');
jest.mock('../db/pool', () => ({
  query: jest.fn(),
}));

const app = require('../index');

describe('Consumable routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jwt.verify.mockReturnValue({
      id: 7,
      username: 'tester',
      role: 'admin',
    });
  });

  test('GET /api/consumables returns all consumables', async () => {
    const consumables = [
      { id: 1, name: 'Gloves', quantity: 10, low_at: 2 },
      { id: 2, name: 'Zip Ties', quantity: 25, low_at: 5 },
    ];

    pool.query.mockResolvedValueOnce({ rows: consumables });

    const response = await request(app)
      .get('/api/consumables')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(consumables);
    expect(pool.query).toHaveBeenCalledWith(
      'SELECT * FROM consumables ORDER BY name'
    );
  });

  test('POST /api/consumables creates a consumable', async () => {
    const requestBody = {
      name: 'Gloves',
      quantity: '10',
      low_at: '2',
      notes: 'Warehouse stock',
    };

    const createdConsumable = {
      id: 1,
      name: 'Gloves',
      quantity: 10,
      low_at: 2,
      notes: 'Warehouse stock',
    };

    pool.query.mockResolvedValueOnce({ rows: [createdConsumable] });

    const response = await request(app)
      .post('/api/consumables')
      .set('Authorization', 'Bearer valid-token')
      .send(requestBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(createdConsumable);

    expect(pool.query).toHaveBeenCalledWith(
      'INSERT INTO consumables (name, quantity, low_at, notes) VALUES ($1,$2,$3,$4) RETURNING *',
      ['Gloves', 10, 2, 'Warehouse stock']
    );
  });

  test('PUT /api/consumables/:id updates a consumable', async () => {
    const requestBody = {
      name: 'Gloves',
      quantity: '20',
      low_at: '4',
      notes: 'Updated stock',
    };

    const updatedConsumable = {
      id: 1,
      name: 'Gloves',
      quantity: 20,
      low_at: 4,
      notes: 'Updated stock',
    };

    pool.query.mockResolvedValueOnce({ rows: [updatedConsumable] });

    const response = await request(app)
      .put('/api/consumables/1')
      .set('Authorization', 'Bearer valid-token')
      .send(requestBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(updatedConsumable);

    expect(pool.query).toHaveBeenCalledWith(
      'UPDATE consumables SET name=$1, quantity=$2, low_at=$3, notes=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
      ['Gloves', 20, 4, 'Updated stock', '1']
    );
  });

  test('DELETE /api/consumables/:id deletes a consumable', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .delete('/api/consumables/1')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    expect(pool.query).toHaveBeenCalledWith(
      'DELETE FROM consumables WHERE id = $1',
      ['1']
    );
  });

  test('consumable routes reject requests without authentication', async () => {
    const response = await request(app).get('/api/consumables');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'No token' });
    expect(pool.query).not.toHaveBeenCalled();
  });
});
