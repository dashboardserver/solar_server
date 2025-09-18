require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');

const fetchAll = require('./tasks/fetchAll');
const { router: kpiRoutes } = require('./routes/kpi');

const app = express();
app.use(cors());
app.use(express.json());
app.get('/', (_req, res) => res.send('✅ Solar backend is running'));
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, uptime: process.uptime() }));

// API routes
app.use('/api/kpi', kpiRoutes);
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 })
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

const DO_BOOT_FETCH = process.env.FETCH_ON_BOOT === 'true';
const instanceId = process.env.RENDER_INSTANCE_ID || 'local';
const isLeader = process.env.LEADER === 'true' || instanceId.endsWith('-0');

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`ℹ Instance: ${instanceId} | Leader: ${isLeader ? 'YES' : 'NO'}`);

  if (DO_BOOT_FETCH) {
    try {
      console.log('ℹ Startup prime enabled (FETCH_ON_BOOT=true).');
      await fetchAll(true);
    } catch (err) {
      console.error('❌ Error during initial prime:', err?.message || err);
    }
  } else {
    console.log('ℹ Startup prime disabled (FETCH_ON_BOOT is not true).');
  }
});

// Cron 21:00 ทำเฉพาะ leader เพื่อลดการยิงซ้ำหลาย instance
if (isLeader) {
  cron.schedule('0 21 * * *', async () => {
    console.log('⏰ Cron 21:00 — fetch KPI for all stations');
    try {
      await fetchAll(true);
    } catch (err) {
      console.error('❌ Error during cron fetch:', err?.message || err);
    }
  }, { timezone: 'Asia/Bangkok' });
} else {
  console.log('🧍 Non-leader instance → skip cron scheduling.');
}
