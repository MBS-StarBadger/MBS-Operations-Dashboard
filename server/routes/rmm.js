const express = require('express');

const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const rmmAgentAuth = require('../middleware/rmmAgentAuth');
const rmmController = require('../controllers/rmmController');
const rmmAuditController = require('../controllers/rmmAuditController');

const router = express.Router();

router.get('/', auth, adminOnly, rmmController.getRmmStatus);

router.get('/devices', auth, adminOnly, rmmController.listDevices);

router.get('/devices/:id', auth, adminOnly, rmmController.getDevice);
router.post('/devices/:deviceId/jobs', auth, adminOnly, rmmController.createDeviceJob);
router.get('/devices/:deviceId/jobs', auth, adminOnly, rmmController.listDeviceJobs);

router.post('/enroll', auth, adminOnly, rmmController.enrollDevice);

router.post('/agent/checkin', rmmAgentAuth, rmmController.agentCheckIn);

router.get('/agent/jobs/next', rmmAgentAuth, rmmController.getNextAgentJob);
router.post('/agent/jobs/:jobId/result', rmmAgentAuth, rmmController.reportAgentJobResult);

router.get('/audit', auth, adminOnly, rmmAuditController.listAudit);

module.exports = router;
