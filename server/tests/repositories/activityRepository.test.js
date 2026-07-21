jest.mock('../../db/pool', () => ({ query: jest.fn() }));

const pool = require('../../db/pool');
const activityRepository = require('../../repositories/activityRepository');

describe('activityRepository', () => {
  it('inserts a activity_log row with user id, action, and details', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await activityRepository.insert(1, 'ADD_ASSET', 'Added asset MBS-001');

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0].replace(/\s+/g, ' ').trim())
      .toBe('INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)');
    expect(pool.query.mock.calls[0][1]).toEqual([1, 'ADD_ASSET', 'Added asset MBS-001']);
  });

  it('returns undefined rather than the query result', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 99 }] });

    await expect(activityRepository.insert(1, 'ADD_ASSET', 'x')).resolves.toBeUndefined();
  });

  it('propagates database errors, such as a foreign key violation', async () => {
    const dbError = new Error('violates foreign key constraint "activity_log_user_id_fkey"');
    pool.query.mockRejectedValue(dbError);

    await expect(activityRepository.insert(999, 'ADD_ASSET', 'x')).rejects.toThrow(dbError);
  });
});