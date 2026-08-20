const express = require('express');

const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const activityController = require('../controllers/activityController');

const router = express.Router();

router.get('/', auth, adminOnly, activityController.listRecentActivity);

module.exports = router;
