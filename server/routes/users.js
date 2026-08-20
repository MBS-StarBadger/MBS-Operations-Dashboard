const express = require('express');

const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const userController = require('../controllers/userController');

const router = express.Router();

router.get('/', auth, adminOnly, userController.listUsers);

router.post('/', auth, adminOnly, userController.createUser);

router.put('/:id/password', auth, adminOnly, userController.updateUserPassword);

module.exports = router;
