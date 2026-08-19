const express = require('express');

const pool = require('../db/pool');

const auth = require('../middleware/auth');
const assetRepository = require('../repositories/assetRepository');
const activityRepository = require('../repositories/activityRepository');
const assetController = require('../controllers/assetController');

const router = express.Router();

router.get('/', auth, assetController.listAssets);

router.get('/:id', auth, assetController.getAssetById);

router.post('/', auth, assetController.createAsset);

router.put('/:id', auth, assetController.updateAsset);

router.delete('/:id', auth, async (req, res) => {
  await assetRepository.deleteById(req.params.id);
  res.json({ success: true });
});

module.exports = router;


