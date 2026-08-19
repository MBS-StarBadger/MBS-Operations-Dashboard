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

router.put('/:id', auth, async (req, res) => {
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

    const result = await pool.query(
      `UPDATE assets SET asset_tag=$1, type=$2, name=$3, make=$4, model=$5,
        serial_number=$6, assigned_to=$7, location=$8, status=$9, condition=$10,
        windows_license=$11, autopilot_ready=$12, notes=$13, entra_name=$14,
        department=$15, imei=$16, warranty_expiry=$17, warranty_expired=$18,
        qr_code=$19, updated_at=NOW() WHERE id=$20 RETURNING *`,
      [
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
        parseInt(department) || null,
        parseInt(imei) || null,
        warranty_expiry || null,
        warranty_expired || null,
        qr_code || null,
        req.params.id,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  await assetRepository.deleteById(req.params.id);
  res.json({ success: true });
});

module.exports = router;


