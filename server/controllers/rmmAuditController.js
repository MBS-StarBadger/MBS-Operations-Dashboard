const rmmAuditRepository = require('../repositories/rmmAuditRepository');

async function listAudit(req, res) {
  try {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 100, 1),
      500
    );

    const entries = await rmmAuditRepository.findRecent(limit);
    res.json(entries);
  } catch (error) {
    console.error('RMM audit query failed:', error);
    res.status(500).json({ error: 'Unable to load RMM audit log' });
  }
}

module.exports = {
  listAudit,
};
