// server.js
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

// ===== Helpers เวลา Asia/Bangkok เพื่อ initial cache =====
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
function bkkYYYYMMDD(d) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}
function startOfBkkDayUTC(dateUtc = new Date()) {
  const [y,m,day] = bkkYYYYMMDD(dateUtc).split('-').map(Number);
  return new Date(Date.UTC(y, m-1, day) - BKK_OFFSET_MS);
}

// ✅ เชื่อมต่อ MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');

    // ✅ Start Express Server
    app.listen(5000, () => {
      console.log('🚀 Server running on port 5000');

      // ✅ ตั้งดึงทุกวันเวลา 21:00 น. (ไทย) → บันทึกเป็น "วันพรุ่งนี้"
      cron.schedule('0 21 * * *', async () => {
        console.log('📥 Daily scheduled KPI fetch at 00:05 (TH time)');
        await fetchKPI(true);
      }, { timezone: 'Asia/Bangkok' });

      // ✅ Initial cache: พยายามโหลด "ของวันนี้" (appliesToDate = วันนี้ 00:00 ไทย)
      (async () => {
        try {
          const KPI = require('./models/KPI');
          const todayApplies = startOfBkkDayUTC(new Date());

          let doc = await KPI.findOne({ appliesToDate: todayApplies });
          if (!doc) {
            doc = await KPI.findOne({ appliesToDate: { $lte: todayApplies } }).sort({ appliesToDate: -1 });
          }

          if (doc) {
            console.log('✅ Loaded KPI for today into cache');
            setKpiCache(doc);
          } else {
            console.log('ℹ️ No KPI for today yet, triggering one fetch for tomorrow snapshot...');
            await fetchKPI(true); // เตรียมของ "พรุ่งนี้" ไว้เลย
          }
        } catch (err) {
          console.error('❌ Error during initial KPI load:', err.message);
        }
      })();
    });
  })
  .catch((err) => console.error('❌ MongoDB connection error:', err.message));
