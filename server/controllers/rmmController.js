const rmmRepository = require('../repositories/rmmRepository');

async function getRmmStatus(req, res) {
  const devices = await rmmRepository.getSummary();

  res.json({
    module: 'rmm',
    status: 'ready',
    devices,
  });
}

async function listDevices(req, res) {
  const devices = await rmmRepository.findAll();
  res.json(devices);
}

module.exports = {
  getRmmStatus,
  listDevices,
};
