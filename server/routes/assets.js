const express = require('express');

const auth = require('../middleware/auth');
const assetRepository = require('../repositories/assetRepository');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const assets = await assetRepository.findAll();
  res.json(assets);
});

router.get('/:id', auth, async (req, res) => {
  const asset = await assetRepository.findById(req.params.id);

  if (!asset) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(asset);
});

module.exports = router;
