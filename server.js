const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const fetchKPI = require('./tasks/fetchKPI');
const authRoutes = require('./routes/auth');
const { router: seafdecRoutes, setKpiCache } = require('./routes/seafdec');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'build', 'index.html'));
});

app.use('/api/auth', authRoutes);
app.use('/api/seafdec', seafdecRoutes);

// เชื่อมต่อ MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(5000, () => {
      console.log('🚀 Server running on port 5000');

      // ✅ ดึงทุก 10 นาที (real-time cache)
      cron.schedule('*/10 * * * *', async () => {
        const kpi = await fetchKPI(false);
        if (kpi) setKpiCache(kpi);
      });

      // ✅ บันทึกลง DB วันละ 1 ครั้ง (10:00 น.ไทย)
      cron.schedule('0 3 * * *', async () => {
        await fetchKPI(true);
      });

      // ✅ ดึงครั้งแรกทันที
      (async () => {
        const kpi = await fetchKPI(false);
        if (kpi) setKpiCache(kpi);
      })();
    });
  })
  .catch((err) => console.error('❌ MongoDB connection error:', err.message));
