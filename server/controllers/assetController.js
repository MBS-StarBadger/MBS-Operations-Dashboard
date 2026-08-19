const assetRepository = require('../repositories/assetRepository');

async function listAssets(req, res) {
  const assets = await assetRepository.findAll();
  res.json(assets);
}

async function getAssetById(req, res) {
  const asset = await assetRepository.findById(req.params.id);

  if (!asset) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(asset);
}

module.exports = {
  listAssets,
  getAssetById,
};
