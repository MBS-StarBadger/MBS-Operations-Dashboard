const assetRepository = require('./repositories/assetRepository');
const activityRepository = require('./repositories/activityRepository');
const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const pool = require('./db/pool');

const auth = require('./middleware/auth');
const adminOnly = require('./middleware/adminOnly');
const dashboardRouter = require('./routes/dashboard');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/dashboard', dashboardRouter);

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      asset_tag VARCHAR(50) UNIQUE,
      type VARCHAR(50),
      name VARCHAR(100),
      make VARCHAR(100),
      model VARCHAR(100),
      serial_number VARCHAR(100),
      assigned_to VARCHAR(100),
      location VARCHAR(100),
      status VARCHAR(50) DEFAULT 'available',
      condition VARCHAR(50),
      windows_license BOOLEAN DEFAULT false,
      autopilot_ready BOOLEAN DEFAULT false,
      notes TEXT,
      history JSONB DEFAULT '[]',
      shipping_records JSONB DEFAULT '[]',
      qr_code VARCHAR(100),
      photos JSONB DEFAULT '[]',
      entra_name VARCHAR(100),
      department VARCHAR(100),
      imei VARCHAR(100),
      warranty_expiry DATE,
      warranty_expired BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS consumables (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      quantity INTEGER DEFAULT 0,
      low_at INTEGER DEFAULT 2,
      notes TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      action VARCHAR(100),
      details TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS shirts (
      id SERIAL PRIMARY KEY,
      color VARCHAR(20) NOT NULL,
      size VARCHAR(10) NOT NULL,
      quantity INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(color, size)
    );
    CREATE TABLE IF NOT EXISTS tools (
      id SERIAL PRIMARY KEY,
      tool_tag VARCHAR(50),
      name VARCHAR(100) NOT NULL,
      category VARCHAR(50),
      condition VARCHAR(50),
      status VARCHAR(50) DEFAULT 'In Storage',
      assigned_to VARCHAR(100),
      notes TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS trucks (
      id SERIAL PRIMARY KEY,
      truck_tag VARCHAR(50),
      year INTEGER,
      make_model VARCHAR(100),
      plate VARCHAR(20),
      status VARCHAR(50) DEFAULT 'In Service',
      assigned_to VARCHAR(100),
      mileage INTEGER,
      last_service DATE,
      next_service DATE,
      notes TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  const existing = await pool.query('SELECT * FROM users WHERE role = $1', ['admin']);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash('MBSAdmin2026!', 10);
    await pool.query(
      'INSERT INTO users (username, password, role) VALUES ($1, $2, $3)',
      ['admin', hash, 'admin']
    );
    console.log('Default admin created: admin / MBSAdmin2026!');
  }
  console.log('Database ready');

  // Seed shirts if empty
  const shirtCheck = await pool.query('SELECT COUNT(*) FROM shirts');
  if (parseInt(shirtCheck.rows[0].count) === 0) {
    const colors = ['Tan', 'Grey'];
    const sizes  = ['S', 'M', 'L', 'XL', '2XL'];
    for (const color of colors) {
      for (const size of sizes) {
        await pool.query(
          'INSERT INTO shirts (color, size, quantity) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING',
          [color, size]
        );
      }
    }
    console.log('Shirts seeded');
  }
}

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users', auth, adminOnly, async (req, res) => {
  const result = await pool.query('SELECT id, username, role, created_at FROM users ORDER BY id');
  res.json(result.rows);
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
      [username, hash, role || 'user']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

app.put('/api/users/:id/password', auth, adminOnly, async (req, res) => {
  const hash = await bcrypt.hash(req.body.password, 10);
  await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, req.params.id]);
  res.json({ success: true });
});

app.get('/api/assets', auth, async (req, res) => {
  const assets = await assetRepository.findAll();
  res.json(assets);
});

app.get('/api/assets/:id', auth, async (req, res) => {
  const result = await pool.query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

app.post('/api/assets', auth, async (req, res) => {
  try {
    const { asset_tag, type, name, make, model, serial_number, assigned_to,
            location, status, condition, windows_license, autopilot_ready,
            notes, entra_name, department, imei, warranty_expiry, warranty_expired } = req.body;
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
    await pool.query(
      'INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'ADD_ASSET', `Added asset ${asset_tag}`]
    );
    res.json(asset);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/assets/:id', auth, async (req, res) => {
  try {
    const { asset_tag, type, name, make, model, serial_number, assigned_to,
            location, status, condition, windows_license, autopilot_ready,
            notes, entra_name, department, imei, warranty_expiry, warranty_expired,
            qr_code } = req.body;
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
});

app.delete('/api/assets/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM assets WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/consumables', auth, async (req, res) => {
  const result = await pool.query('SELECT * FROM consumables ORDER BY name');
  res.json(result.rows);
});

app.post('/api/consumables', auth, async (req, res) => {
  const { name, quantity, low_at, notes } = req.body;
  const result = await pool.query(
    'INSERT INTO consumables (name, quantity, low_at, notes) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, parseInt(quantity)||0, parseInt(low_at)||2, notes||'']
  );
  res.json(result.rows[0]);
});

app.put('/api/consumables/:id', auth, async (req, res) => {
  const { name, quantity, low_at, notes } = req.body;
  const result = await pool.query(
    'UPDATE consumables SET name=$1, quantity=$2, low_at=$3, notes=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
    [name, parseInt(quantity)||0, parseInt(low_at)||2, notes||'', req.params.id]
  );
  res.json(result.rows[0]);
});

app.delete('/api/consumables/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM consumables WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/shirts', auth, async (req, res) => {
  const result = await pool.query('SELECT * FROM shirts ORDER BY color, CASE size WHEN \'S\' THEN 1 WHEN \'M\' THEN 2 WHEN \'L\' THEN 3 WHEN \'XL\' THEN 4 WHEN \'2XL\' THEN 5 END');
  res.json(result.rows);
});

app.put('/api/shirts/:id', auth, async (req, res) => {
  const { quantity } = req.body;
  const result = await pool.query(
    'UPDATE shirts SET quantity=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
    [Math.max(0, parseInt(quantity)||0), req.params.id]
  );
  res.json(result.rows[0]);
});

// ── Tools ────────────────────────────────────────────────────────────────────
app.get('/api/tools', auth, async (req, res) => {
  const result = await pool.query('SELECT * FROM tools ORDER BY name');
  res.json(result.rows);
});

app.post('/api/tools', auth, async (req, res) => {
  try {
    const { tool_tag, name, category, condition, status, assigned_to, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO tools (tool_tag, name, category, condition, status, assigned_to, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tool_tag||null, name, category||null, condition||null, status||'In Storage', assigned_to||null, notes||'']
    );
    await pool.query(
      'INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'ADD_TOOL', `Added tool ${name}`]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/tools/:id', auth, async (req, res) => {
  try {
    const { tool_tag, name, category, condition, status, assigned_to, notes } = req.body;
    const result = await pool.query(
      `UPDATE tools SET tool_tag=$1, name=$2, category=$3, condition=$4, status=$5,
        assigned_to=$6, notes=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
      [tool_tag||null, name, category||null, condition||null, status||'In Storage', assigned_to||null, notes||'', req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/tools/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM tools WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ── Trucks ───────────────────────────────────────────────────────────────────
app.get('/api/trucks', auth, async (req, res) => {
  const result = await pool.query('SELECT * FROM trucks ORDER BY truck_tag');
  res.json(result.rows);
});

app.post('/api/trucks', auth, async (req, res) => {
  try {
    const { truck_tag, year, make_model, plate, status, assigned_to, mileage, last_service, next_service, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO trucks (truck_tag, year, make_model, plate, status, assigned_to, mileage, last_service, next_service, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [truck_tag||null, parseInt(year)||null, make_model||null, plate||null, status||'In Service',
       assigned_to||null, parseInt(mileage)||null, last_service||null, next_service||null, notes||'']
    );
    await pool.query(
      'INSERT INTO activity_log (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'ADD_TRUCK', `Added truck ${truck_tag||make_model||''}`]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/trucks/:id', auth, async (req, res) => {
  try {
    const { truck_tag, year, make_model, plate, status, assigned_to, mileage, last_service, next_service, notes } = req.body;
    const result = await pool.query(
      `UPDATE trucks SET truck_tag=$1, year=$2, make_model=$3, plate=$4, status=$5,
        assigned_to=$6, mileage=$7, last_service=$8, next_service=$9, notes=$10, updated_at=NOW() WHERE id=$11 RETURNING *`,
      [truck_tag||null, parseInt(year)||null, make_model||null, plate||null, status||'In Service',
       assigned_to||null, parseInt(mileage)||null, last_service||null, next_service||null, notes||'', req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/trucks/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM trucks WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/activity', auth, adminOnly, async (req, res) => {
  const result = await pool.query(
    `SELECT a.*, u.username FROM activity_log a
     JOIN users u ON a.user_id = u.id
     ORDER BY a.created_at DESC LIMIT 100`
  );
  res.json(result.rows);
});

app.get('/asset/:tag', (req, res) => {
  res.redirect(`/?asset=${encodeURIComponent(req.params.tag)}`);
});

app.use(express.static('public'));

if (require.main === module) {
  initDB().then(() => {
    app.listen(process.env.PORT, () => {
      console.log(`MBS Backend running on port ${process.env.PORT}`);
    });
  });
}

module.exports = app;

