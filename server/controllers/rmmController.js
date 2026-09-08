const crypto = require('crypto');
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


async function enrollDevice(req, res) {
  try {
    const hostname = String(req.body?.hostname || '').trim();

    if (!hostname) {
      return res.status(400).json({ error: 'Hostname is required' });
    }

    const agentId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const device = await rmmRepository.createEnrollment({
      agentId,
      hostname,
      tokenHash,
    });

    try {
      await rmmAuditRepository.insert({
        userId: req.user?.id || null,
        deviceId: device.id,
        action: 'RMM_DEVICE_ENROLLED',
        result: 'success',
        details: `Enrolled RMM device ${hostname}`,
        sourceIp: req.ip || req.socket?.remoteAddress || null,
        mfaVerified: false,
      });
    } catch (auditError) {
      console.error('RMM enrollment audit failed:', auditError);
    }

    res.status(201).json({
      device,
      credentials: {
        agent_id: agentId,
        token,
      },
    });
  } catch (error) {
    console.error('RMM enrollment failed:', error);
    res.status(500).json({ error: 'Unable to enroll RMM device' });
  }
}

async function agentCheckIn(req, res) {
  try {
    const device = req.rmmDevice;

    const hostname = String(
      req.body?.hostname || device.hostname || ''
    ).trim();

    if (!hostname) {
      return res.status(400).json({
        error: 'Hostname is required',
      });
    }

    const updated = await rmmRepository.checkIn({
      agentId: device.agent_id,
      hostname,
      osName: req.body?.os_name || null,
      osVersion: req.body?.os_version || null,
      architecture: req.body?.architecture || null,
      serialNumber: req.body?.serial_number || null,
      ipAddress:
        req.body?.ip_address ||
        req.ip ||
        req.socket?.remoteAddress ||
        null,
      loggedInUser: req.body?.logged_in_user || null,
      agentVersion: req.body?.agent_version || null,
    });

    return res.json({
      status: 'ok',
      device: updated,
    });
  } catch (error) {
    console.error('RMM agent check-in failed:', error);

    return res.status(500).json({
      error: 'Unable to process RMM agent check-in',
    });
  }
}

module.exports = {
  getRmmStatus,
  listDevices,
  enrollDevice,
  agentCheckIn,
};
