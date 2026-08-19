const express = require('express');

const auth = require('../middleware/auth');
const consumableController = require('../controllers/consumableController');

const router = express.Router();

router.get('/', auth, consumableController.listConsumables);

router.post('/', auth, consumableController.createConsumable);

router.put('/:id', auth, consumableController.updateConsumable);

router.delete('/:id', auth, consumableController.deleteConsumable);

module.exports = router;
