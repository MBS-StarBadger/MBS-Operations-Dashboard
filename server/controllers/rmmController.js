const crypto = require('crypto');
const { validateInventory } = require('../validation/rmmInventory');
const rmmCorrelationRepository = require('../repositories/rmmCorrelationRepository');
const rmmRepository = require('../repositories/rmmRepository');
const rmmAuditRepository = require('../repositories/rmmAuditRepository');
const rmmJobRepository = require('../repositories/rmmJobRepository');

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

async function getDevice(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: 'Invalid device ID',
      });
    }

    const device = await rmmRepository.findById(id);

    if (!device) {
      return res.status(404).json({
        error: 'RMM device not found',
      });
    }

    const correlation = await rmmCorrelationRepository.correlateDevice(id);
    return res.json({ ...device, correlation });
  } catch (error) {
    console.error('RMM device lookup failed:', error);

    return res.status(500).json({
      error: 'Unable to load RMM device',
    });
  }
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
  let hardware;
  try { hardware = validateInventory(req.body || {}); }
  catch (error) { return res.status(400).json({ error: error.message }); }
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
      hardware,
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
      manufacturer: req.body?.manufacturer || null,
      model: req.body?.model || null,
    });

    await rmmCorrelationRepository.correlateDevice(device.id, { autoLink: true });

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

async function getNextAgentJob(req, res) {
  try {
    const device = req.rmmDevice;
    const job = await rmmJobRepository.claimNextForDevice(device.id);

    return res.status(200).json({ status: 'ok', job });
  } catch (error) {
    console.error('RMM agent job poll failed:', error);

    return res.status(500).json({
      error: 'Unable to retrieve RMM job',
    });
  }
}

async function reportAgentJobResult(req, res) {
  const jobId = Number(req.params.jobId);
  const body = req.body || {};
  if (!/^[1-9]\d*$/.test(req.params.jobId) || !Number.isSafeInteger(jobId)) {
    return res.status(400).json({ error: 'Invalid job ID' });
  }
  if (!['started', 'completed', 'failed'].includes(body.status)) {
    return res.status(400).json({ error: 'Status must be started, completed, or failed' });
  }
  if (body.result_code != null && (!Number.isInteger(body.result_code) ||
      body.result_code < -2147483648 || body.result_code > 2147483647)) {
    return res.status(400).json({ error: 'result_code must be a 32-bit integer' });
  }
  for (const field of ['result_output', 'result_error']) {
    if (body[field] != null && typeof body[field] !== 'string') {
      return res.status(400).json({ error: `${field} must be a string` });
    }
  }

  try {
    const result = await rmmJobRepository.reportResultForDevice(jobId, req.rmmDevice.id, body);
    if (result.error === 'not_found') {
      return res.status(404).json({ error: 'RMM job not found' });
    }
    if (result.error === 'invalid_transition') {
      return res.status(400).json({ error: 'Invalid RMM job status transition' });
    }
    return res.status(200).json({ status: 'ok', job: result.job });
  } catch (error) {
    console.error('RMM agent job result failed:', error);
    return res.status(500).json({ error: 'Unable to report RMM job result' });
  }
}

const dashboardJobTypes = new Set(['inventory_refresh', 'windows_update_scan']);

function parseJobDeviceId(value) {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

async function createDeviceJob(req, res) {
  const deviceId = parseJobDeviceId(req.params.deviceId);
  if (!deviceId) return res.status(400).json({ error: 'Invalid device ID' });
  const jobType = req.body?.job_type;
  if (!dashboardJobTypes.has(jobType)) {
    return res.status(400).json({ error: 'Unsupported job type; only inventory_refresh and windows_update_scan are allowed' });
  }
  try {
    const device = await rmmRepository.findById(deviceId);
    if (!device) return res.status(404).json({ error: 'RMM device not found' });
    if (device.asset_id != null && !['Desktop', 'Laptop', 'Server'].includes(device.asset_type)) {
      return res.status(400).json({ error: 'Linked asset is outside RMM scope' });
    }
    const job = await rmmJobRepository.createForDevice(deviceId, jobType, req.user.id);
    if (!job) return res.status(409).json({ error: 'A Windows Update scan is already queued or running' });
    try {
      await rmmAuditRepository.insert({
        userId: req.user.id,
        deviceId,
        action: 'RMM_JOB_CREATED',
        result: 'success',
        details: `Queued ${jobType} job ${job.id}`,
        sourceIp: req.ip || req.socket?.remoteAddress || null,
        mfaVerified: false,
      });
    } catch (auditError) {
      console.error('RMM job creation audit failed:', auditError);
    }
    return res.status(201).json({ status: 'ok', job });
  } catch (error) {
    console.error('RMM job creation failed:', error);
    return res.status(500).json({ error: 'Unable to create RMM job' });
  }
}

async function listDeviceJobs(req, res) {
  const deviceId = parseJobDeviceId(req.params.deviceId);
  if (!deviceId) return res.status(400).json({ error: 'Invalid device ID' });
  try {
    const device = await rmmRepository.findById(deviceId);
    if (!device) return res.status(404).json({ error: 'RMM device not found' });
    const jobs = await rmmJobRepository.findRecentForDevice(deviceId);
    return res.json({ status: 'ok', jobs });
  } catch (error) {
    console.error('RMM job history failed:', error);
    return res.status(500).json({ error: 'Unable to load RMM job history' });
  }
}

module.exports = {
  createDeviceJob,
  listDeviceJobs,
  getRmmStatus,
  listDevices,
  getDevice,
  enrollDevice,
  agentCheckIn,
  getNextAgentJob,
  reportAgentJobResult,
};
