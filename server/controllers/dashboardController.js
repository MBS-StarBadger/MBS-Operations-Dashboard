const dashboardRepository = require('../repositories/dashboardRepository');

async function getDashboard(req, res) {
  try {
    const dashboard = await dashboardRepository.getSummary();
    res.json(dashboard);
  } catch (error) {
    console.error('Dashboard query failed:', error);
    res.status(500).json({ error: 'Unable to load dashboard' });
  }
}

module.exports = {
  getDashboard,
};
