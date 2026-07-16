const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'mbs_assets',
  user: 'mbsadmin',
  password: 'MBSAdmin2026',
});

async function importData() {
  const raw = fs.readFileSync('/home/mbsadmin/mbs-backup.json', 'utf8');
  const data = JSON.parse(raw);
  const assets = data.assets || [];

  console.log(`Importing ${assets.length} assets...`);

  for (const a of assets) {
    try {
      await pool.query(
        `INSERT INTO assets (asset_tag, type, name, make, model, serial_number,
          assigned_to, location, status, condition, windows_license, autopilot_ready,
          notes, history, shipping_records, qr_code, entra_name, department,
          imei, warranty_expiry, warranty_expired, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (asset_tag) DO NOTHING`,
        [
          a.tag, a.type, a.name, a.make, a.model, a.serial,
          a.assignedTo, a.location, a.status, a.condition,
          a.windowsLicense || false, a.autopilotReady || false,
          a.notes, JSON.stringify(a.history || []),
          JSON.stringify(a.shippingRecords || []),
          a.qrCode || '', a.entraName || '', a.department || '',
          a.imei || '', a.warrantyExpiry || null, a.warrantyExpired || false,
          a.createdAt || new Date().toISOString()
        ]
      );
      console.log(`✓ ${a.tag} — ${a.name || a.make}`);
    } catch(e) {
      console.log(`✗ ${a.tag} — ${e.message}`);
    }
  }

  console.log('Import complete!');
  pool.end();
}

importData();
