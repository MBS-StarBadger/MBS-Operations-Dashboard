const express = require('express');

const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const rmmController = require('../controllers/rmmController');
const rmmAuditController = require('../controllers/rmmAuditController');

const router = express.Router();

router.get('/', auth, adminOnly, rmmController.getRmmStatus);

router.get('/devices', auth, adminOnly, rmmController.listDevices);

router.get('/audit', auth, adminOnly, rmmAuditController.listAudit);

module.exports = router;
