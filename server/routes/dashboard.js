const express = require('express');

const pool = require('../db/pool');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const [
      assetCountResult,
      assignedCountResult,
      availableCountResult,
      lowConsumablesResult,
      lowShirtsResult,
      recentActivityResult,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM assets'),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM assets
         WHERE assigned_to IS NOT NULL
           AND assigned_to <> ''`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM assets
         WHERE status = 'available'`
      ),
      pool.query(
        `SELECT id, name, quantity, low_at
         FROM consumables
         WHERE quantity <= low_at
         ORDER BY quantity ASC, name ASC`
      ),
      pool.query(
        `SELECT id, color, size, quantity
         FROM shirts
         WHERE quantity <= 2
         ORDER BY quantity ASC, color ASC, size ASC`
      ),
      pool.query(
        `SELECT a.id, a.action, a.details, a.created_at, u.username
         FROM activity_log a
         LEFT JOIN users u ON a.user_id = u.id
         ORDER BY a.created_at DESC
         LIMIT 10`
      ),
    ]);

    return res.json({
      assets: {
        total: assetCountResult.rows[0].count,
        assigned: assignedCountResult.rows[0].count,
        available: availableCountResult.rows[0].count,
      },
      alerts: {
        lowConsumables: lowConsumablesResult.rows,
        lowShirts: lowShirtsResult.rows,
      },
      recentActivity: recentActivityResult.rows,
    });
  } catch (error) {
    console.error('Dashboard query failed:', error);
    return res.status(500).json({ error: 'Unable to load dashboard' });
  }
});

module.exports = router;