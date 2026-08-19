const assetRepository = require('../repositories/assetRepository');
const activityRepository = require('../repositories/activityRepository');

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

async function createAsset(req, res) {
  try {
    const {
      asset_tag,
      type,
      name,
      make,
      model,
      serial_number,
      assigned_to,
      location,
      status,
      condition,
      windows_license,
      autopilot_ready,
      notes,
      entra_name,
      department,
      imei,
      warranty_expiry,
      warranty_expired,
    } = req.body;

    const asset = await assetRepository.insert({
      asset_tag,
      type,
      name,
      make,
      model,
      serial_number,
      assigned_to,
      location,
      status,
      condition,
      windows_license,
      autopilot_ready,
      notes,
      entra_name,
      department: parseInt(department) || null,
      imei: parseInt(imei) || null,
      warranty_expiry: warranty_expiry || null,
      warranty_expired: warranty_expired || null,
    });

    await activityRepository.insert(
      req.user.id,
      'ADD_ASSET',
      `Added asset ${asset_tag}`
    );

    res.json(asset);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function updateAsset(req, res) {
  try {
    const {
      asset_tag,
      type,
      name,
      make,
      model,
      serial_number,
      assigned_to,
      location,
      status,
      condition,
      windows_license,
      autopilot_ready,
      notes,
      entra_name,
      department,
      imei,
      warranty_expiry,
      warranty_expired,
      qr_code,
    } = req.body;

    const asset = await assetRepository.update(req.params.id, {
      asset_tag,
      type,
      name,
      make,
      model,
      serial_number,
      assigned_to,
      location,
      status,
      condition,
      windows_license,
      autopilot_ready,
      notes,
      entra_name,
      department: parseInt(department) || null,
      imei: parseInt(imei) || null,
      warranty_expiry: warranty_expiry || null,
      warranty_expired: warranty_expired || null,
      qr_code: qr_code || null,
    });

    res.json(asset);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function deleteAsset(req, res) {
  await assetRepository.deleteById(req.params.id);
  res.json({ success: true });
}

module.exports = {
  listAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
};
