const express = require('express');

const pool = require('../db/pool');

const auth = require('../middleware/auth');
const assetRepository = require('../repositories/assetRepository');
const activityRepository = require('../repositories/activityRepository');

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

router.post('/', auth, async (req, res) => {
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

    const result = await pool.query(
      `INSERT INTO assets (asset_tag, type, name, make, model, serial_number, assigned_to,
        location, status, condition, windows_license, autopilot_ready, notes,
        entra_name, department, imei, warranty_expiry, warranty_expired)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
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
      ]
    );

    await activityRepository.insert(
      req.user.id,
      'ADD_ASSET',
      `Added asset ${asset_tag}`
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;


