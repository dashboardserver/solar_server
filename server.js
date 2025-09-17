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
app.get('/', (_req, res) => {
  res.send('✅ Solar backend is running');
});

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

// API routes
app.use('/api/kpi', kpiRoutes);

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 15000,
})
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Prime once at startup
  try {
    console.log('ℹ️ Startup prime — will skip fetch if data for tomorrow already exists.');
    await fetchAll(true); // fetchAll จะเช็ค DB แล้วข้ามเองถ้ามีของพรุ่งนี้อยู่แล้ว
  } catch (err) {
    console.error('❌ Error during initial prime:', err?.message || err);
  }
});

// Schedule fetch every day at 21:00 (server time, UTC+7 = local 21:00)
cron.schedule('0 21 * * *', async () => {
  console.log('⏰ Cron 21:00 — fetch KPI for all stations');
  try {
    await fetchAll(true);
  } catch (err) {
    console.error('❌ Error during cron fetch:', err?.message || err);
  }
});