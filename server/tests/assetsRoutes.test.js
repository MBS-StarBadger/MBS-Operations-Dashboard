const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

jest.mock('jsonwebtoken');
jest.mock('../db/pool', () => ({
  query: jest.fn(),
}));

const app = require('../index');

describe('Asset routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jwt.verify.mockReturnValue({
      id: 7,
      username: 'tester',
      role: 'admin',
    });
  });

  test('GET /api/assets returns all assets', async () => {
    const assets = [
      { id: 2, asset_tag: 'MBS-002' },
      { id: 1, asset_tag: 'MBS-001' },
    ];

    pool.query.mockResolvedValueOnce({ rows: assets });

    const response = await request(app)
      .get('/api/assets')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(assets);
    expect(pool.query).toHaveBeenCalledWith(
      'SELECT * FROM assets ORDER BY created_at DESC'
    );
  });

  test('GET /api/assets/:id returns one asset', async () => {
    const asset = {
      id: 12,
      asset_tag: 'MBS-012',
    };

    pool.query.mockResolvedValueOnce({ rows: [asset] });

    const response = await request(app)
      .get('/api/assets/12')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(asset);
    expect(pool.query).toHaveBeenCalledWith(
      'SELECT * FROM assets WHERE id = $1',
      ['12']
    );
  });

  test('GET /api/assets/:id returns 404 when asset is missing', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/assets/999')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
  });

  test('POST /api/assets creates an asset and records activity', async () => {
    const requestBody = {
      asset_tag: 'MBS-100',
      type: 'Laptop',
      name: 'Test Laptop',
      make: 'Dell',
      model: 'Latitude',
      serial_number: 'ABC123',
      assigned_to: 'Roy',
      location: 'Office',
      status: 'assigned',
      condition: 'good',
      windows_license: true,
      autopilot_ready: false,
      notes: 'Test notes',
      entra_name: 'MBS-LT-100',
      department: '25',
      imei: '',
      warranty_expiry: '',
      warranty_expired: '',
    };

    const createdAsset = {
      id: 100,
      ...requestBody,
      department: 25,
      imei: null,
      warranty_expiry: null,
      warranty_expired: null,
    };

    pool.query
      .mockResolvedValueOnce({ rows: [createdAsset] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .post('/api/assets')
      .set('Authorization', 'Bearer valid-token')
      .send(requestBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(createdAsset);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO assets'),
      [
        'MBS-100',
        'Laptop',
        'Test Laptop',
        'Dell',
        'Latitude',
        'ABC123',
        'Roy',
        'Office',
        'assigned',
        'good',
        true,
        false,
        'Test notes',
        'MBS-LT-100',
        25,
        null,
        null,
        null,
      ]
    );

    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)',
      [7, 'ADD_ASSET', 'Added asset MBS-100']
    );
  });

  test('PUT /api/assets/:id updates an asset', async () => {
    const requestBody = {
      asset_tag: 'MBS-200',
      type: 'Desktop',
      name: 'Updated Desktop',
      make: 'Lenovo',
      model: 'ThinkCentre',
      serial_number: 'XYZ789',
      assigned_to: 'Steve',
      location: 'Warehouse',
      status: 'available',
      condition: 'excellent',
      windows_license: true,
      autopilot_ready: true,
      notes: 'Updated notes',
      entra_name: 'MBS-DT-200',
      department: '12',
      imei: '12345',
      warranty_expiry: '2028-01-01',
      warranty_expired: false,
      qr_code: '',
    };

    const updatedAsset = {
      id: 200,
      ...requestBody,
      department: 12,
      imei: 12345,
      qr_code: null,
    };

    pool.query.mockResolvedValueOnce({ rows: [updatedAsset] });

    const response = await request(app)
      .put('/api/assets/200')
      .set('Authorization', 'Bearer valid-token')
      .send(requestBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(updatedAsset);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE assets'),
      [
        'MBS-200',
        'Desktop',
        'Updated Desktop',
        'Lenovo',
        'ThinkCentre',
        'XYZ789',
        'Steve',
        'Warehouse',
        'available',
        'excellent',
        true,
        true,
        'Updated notes',
        'MBS-DT-200',
        12,
        12345,
        '2028-01-01',
        null,
        null,
        '200',
      ]
    );
  });

  test('DELETE /api/assets/:id deletes the asset', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .delete('/api/assets/42')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(pool.query).toHaveBeenCalledWith(
      'DELETE FROM assets WHERE id = $1',
      ['42']
    );
  });

  test('asset routes reject requests without authentication', async () => {
    const response = await request(app).get('/api/assets');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'No token' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('POST /api/assets returns 400 when the database fails', async () => {
    pool.query.mockRejectedValueOnce(
      new Error('asset_tag already exists')
    );

    const response = await request(app)
      .post('/api/assets')
      .set('Authorization', 'Bearer valid-token')
      .send({
        asset_tag: 'MBS-100',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'asset_tag already exists',
    });
  });
});
