const activityRepository = require('../repositories/activityRepository');

async function listRecentActivity(req, res) {
  const activity = await activityRepository.findRecent();
  res.json(activity);
}

module.exports = {
  listRecentActivity,
};
