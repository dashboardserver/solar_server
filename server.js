const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path'); // ✅ ต้องมี
const fetchKPI = require('./tasks/fetchKPI');
const authRoutes = require('./routes/auth');
const { router: seafdecRoutes, setKpiCache } = require('./routes/seafdec');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Routes
app.use('/api/auth', authRoutes);
app.use('/api/seafdec', seafdecRoutes);

// ✅ MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ MongoDB connected');
  app.listen(5000, () => {
    console.log('🚀 Server on port 5000');

    // ดึงทุก 10 นาที
    cron.schedule('*/10 * * * *', async () => {
      const kpi = await fetchKPI(false);
      if (kpi) setKpiCache(kpi);
    });

    // เก็บ DB ตอน 10 โมง (UTC = 03:00)
    cron.schedule('0 3 * * *', async () => {
      await fetchKPI(true);
    });

    // ดึงรอบแรกทันที
    (async () => {
      const kpi = await fetchKPI(false);
      if (kpi) setKpiCache(kpi);
    })();
  });
}).catch((err) => console.error('❌ MongoDB Error:', err.message));

// ✅ Serve frontend
app.use(express.static(path.join(__dirname, 'client', 'build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'build', 'index.html'));
});
