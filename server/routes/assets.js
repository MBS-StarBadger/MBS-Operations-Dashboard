const express = require('express');

const auth = require('../middleware/auth');
const assetController = require('../controllers/assetController');

const router = express.Router();

router.get('/', auth, assetController.listAssets);

router.get('/:id', auth, assetController.getAssetById);

router.post('/', auth, assetController.createAsset);

router.put('/:id', auth, assetController.updateAsset);

router.delete('/:id', auth, assetController.deleteAsset);

module.exports = router;