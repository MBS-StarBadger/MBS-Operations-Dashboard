jest.mock('../../db/pool', () => ({ query: jest.fn() }));

const pool = require('../../db/pool');
const assetRepository = require('../../repositories/assetRepository');

const normalize = (sql) => sql.replace(/\s+/g, ' ').trim();

describe('assetRepository', () => {
  describe('findAll', () => {
    it('selects all assets ordered by created_at descending', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] });

      const rows = await assetRepository.findAll();

      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(normalize(pool.query.mock.calls[0][0]))
        .toBe('SELECT * FROM assets ORDER BY created_at DESC');
      expect(pool.query.mock.calls[0][1]).toBeUndefined();
      expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('returns an empty array when there are no assets', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await expect(assetRepository.findAll()).resolves.toEqual([]);
    });
  });

  describe('findById', () => {
    it('selects a single asset by id', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: 7 }] });

      const row = await assetRepository.findById(7);

      expect(normalize(pool.query.mock.calls[0][0]))
        .toBe('SELECT * FROM assets WHERE id = $1');
      expect(pool.query.mock.calls[0][1]).toEqual([7]);
      expect(row).toEqual({ id: 7 });
    });

    it('returns undefined when no row matches', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await expect(assetRepository.findById(999)).resolves.toBeUndefined();
    });
  });

  describe('insert', () => {
    const values = {
      asset_tag: 'MBS-001', type: 'Laptop', name: 'Dell 5540', make: 'Dell',
      model: '5540', serial_number: 'SN123', assigned_to: 'R. Cooper',
      location: 'HQ', status: 'assigned', condition: 'Good',
      windows_license: true, autopilot_ready: false, notes: 'note',
      entra_name: 'rcooper', department: 42, imei: null,
      warranty_expiry: '2027-01-01', warranty_expired: null,
    };

    it('passes the 18 insert columns as parameters in schema order', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: 1 }] });

      await assetRepository.insert(values);

      expect(pool.query.mock.calls[0][1]).toEqual([
        'MBS-001', 'Laptop', 'Dell 5540', 'Dell', '5540', 'SN123', 'R. Cooper',
        'HQ', 'assigned', 'Good', true, false, 'note',
        'rcooper', 42, null, '2027-01-01', null,
      ]);
    });

    it('does not include qr_code in the insert', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: 1 }] });

      await assetRepository.insert({ ...values, qr_code: 'SHOULD-BE-IGNORED' });

      expect(pool.query.mock.calls[0][0]).not.toContain('qr_code');
      expect(pool.query.mock.calls[0][1]).not.toContain('SHOULD-BE-IGNORED');
      expect(pool.query.mock.calls[0][1]).toHaveLength(18);
    });

    it('passes undefined for columns missing from values', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: 1 }] });

      await assetRepository.insert({ asset_tag: 'MBS-002' });

      const params = pool.query.mock.calls[0][1];
      expect(params[0]).toBe('MBS-002');
      expect(params.slice(1)).toEqual(new Array(17).fill(undefined));
    });

    it('returns the inserted row', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: 5, asset_tag: 'MBS-001' }] });

      await expect(assetRepository.insert(values))
        .resolves.toEqual({ id: 5, asset_tag: 'MBS-001' });
    });

    it('propagates database errors', async () => {
      const dbError = new Error('duplicate key value violates unique constraint');
      pool.query.mockRejectedValue(dbError);

      await expect(assetRepository.insert(values)).rejects.toThrow(dbError);
    });
  });

  describe('update', () => {
    const values = {
      asset_tag: 'MBS-001', type: 'Laptop', name: 'Dell 5540', make: 'Dell',
      model: '5540', serial_number: 'SN123', assigned_to: 'R. Cooper',
      location: 'HQ', status: 'assigned', condition: 'Good',
      windows_license: true, autopilot_ready: false, notes: 'note',
      entra_name: 'rcooper', department: 42, imei: null,
      warranty_expiry: '2027-01-01', warranty_expired: null, qr_code: 'QR-1',
    };

    it('passes the 19 update columns followed by the id', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: 3 }] });

      await assetRepository.update(3, values);

      const params = pool.query.mock.calls[0][1];
      expect(params).toHaveLength(20);
      expect(params).toEqual([
        'MBS-001', 'Laptop', 'Dell 5540', 'Dell', '5540', 'SN123', 'R. Cooper',
        'HQ', 'assigned', 'Good', true, false, 'note',
        'rcooper', 42, null, '2027-01-01', null, 'QR-1',
        3,
      ]);
    });

    it('sets updated_at to NOW()', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: 3 }] });

      await assetRepository.update(3, values);

      expect(normalize(pool.query.mock.calls[0][0])).toContain('updated_at=NOW()');
    });

    it('passes undefined for columns missing from values, nulling them in a full-row update', async () => {
      pool.query.mockResolvedValue({ rows: [{ id: 3 }] });

      await assetRepository.update(3, { asset_tag: 'MBS-003' });

      const params = pool.query.mock.calls[0][1];
      expect(params[0]).toBe('MBS-003');
      expect(params.slice(1, 19)).toEqual(new Array(18).fill(undefined));
      expect(params[19]).toBe(3);
    });

    it('returns undefined when the id does not exist', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await expect(assetRepository.update(999, values)).resolves.toBeUndefined();
    });

    it('propagates database errors', async () => {
      const dbError = new Error('invalid input syntax for type integer');
      pool.query.mockRejectedValue(dbError);

      await expect(assetRepository.update(3, values)).rejects.toThrow(dbError);
    });
  });

  describe('deleteById', () => {
    it('deletes by id', async () => {
      pool.query.mockResolvedValue({ rowCount: 1, rows: [] });

      await assetRepository.deleteById(4);

      expect(normalize(pool.query.mock.calls[0][0]))
        .toBe('DELETE FROM assets WHERE id = $1');
      expect(pool.query.mock.calls[0][1]).toEqual([4]);
    });

    it('resolves without error when nothing was deleted', async () => {
      pool.query.mockResolvedValue({ rowCount: 0, rows: [] });

      await expect(assetRepository.deleteById(999)).resolves.toBeUndefined();
    });
  });
});