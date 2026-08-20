const express = require('express');

const auth = require('../middleware/auth');
const shirtController = require('../controllers/shirtController');

const router = express.Router();

router.get('/', auth, shirtController.listShirts);

router.put('/:id', auth, shirtController.updateShirtQuantity);

module.exports = router;
