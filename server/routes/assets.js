const express = require('express');

const auth = require('../middleware/auth');
const assetRepository = require('../repositories/assetRepository');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const assets = await assetRepository.findAll();
  res.json(assets);
});

module.exports = router;
