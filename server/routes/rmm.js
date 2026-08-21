const express = require('express');

const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const rmmController = require('../controllers/rmmController');

const router = express.Router();

router.get('/', auth, adminOnly, rmmController.getRmmStatus);

router.get('/devices', auth, adminOnly, rmmController.listDevices);

module.exports = router;
