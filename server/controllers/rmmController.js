const rmmRepository = require('../repositories/rmmRepository');
const rmmAuditRepository = require('../repositories/rmmAuditRepository');

async function getRmmStatus(req, res) {
  const devices = await rmmRepository.getSummary();

  try {
    await rmmAuditRepository.insert({
      userId: req.user?.id || null,
      action: 'RMM_VIEWED',
      result: 'success',
      details: 'Opened RMM dashboard',
      sourceIp: req.ip || req.socket?.remoteAddress || null,
      mfaVerified: false,
    });
  } catch (error) {
    console.error('RMM view audit failed:', error);
  }

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
