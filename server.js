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

app.get('/', (req, res) => {
  res.send('🌞 Solar Dashboard Backend is running');
});

app.use('/api/auth', authRoutes);
app.use('/api/seafdec', seafdecRoutes);

// ✅ เชื่อมต่อ MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');

    // ✅ Start Express Server
    app.listen(5000, () => {
      console.log('🚀 Server running on port 5000');
      
      // ✅ ดึงและบันทึกลง DB วันละครั้ง (เวลา 21:00 น.ไทย)
      cron.schedule('0 14 * * *', async () => {
        console.log('📥 Daily scheduled KPI fetch at 21:00 (TH time)');
        await fetchKPI(true);
      });

      // ✅ ดึงครั้งแรกทันที ถ้ายังไม่มีใน DB
      (async () => {
        try {
          const today = new Date().toISOString().split('T')[0];
          const KPI = require('./models/KPI');
          const existing = await KPI.findOne({ date: today });
          if (!existing) {
            console.log('📥 Initial fetch KPI...');
            const kpi = await fetchKPI(true);
            if (kpi) setKpiCache(kpi);
          } else {
            console.log('✅ KPI already exists in DB');
            setKpiCache(existing);
          }
        } catch (err) {
          console.error('❌ Error during initial KPI fetch:', err.message);
        }
      })();

    });
  })
  .catch((err) => console.error('❌ MongoDB connection error:', err.message));
