const assetRepository = require('../repositories/assetRepository');

async function listAssets(req, res) {
  const assets = await assetRepository.findAll();
  res.json(assets);
}

module.exports = {
  listAssets,
};
