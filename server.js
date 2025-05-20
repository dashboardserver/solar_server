const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const fetchKPI = require('./tasks/fetchKPI');
const authRoutes = require('./routes/auth');
const seafdecRoutes = require('./routes/seafdec');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {
  res.send("🌞 Solar Dashboard Backend is running");
}); // หน้าแรก

app.use('/api/auth', authRoutes);
app.use('/api/seafdec', seafdecRoutes);

console.log('🔍 MONGO_URI:', process.env.MONGO_URI);
// ✅ เชื่อม MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('✅ MongoDB connected');

    // ✅ เริ่ม server
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);

      // ✅ ตั้งเวลาให้ดึงข้อมูล KPI ทุกวันเวลา 09:00 UTC+7
      cron.schedule('0 2 * * *', () => {
        console.log('⏰ Running daily KPI fetch at 09:00');
        fetchKPI();
      });

      // (Optional) ทดสอบดึงทันทีเมื่อรัน server
      console.log('⏳ Fetching KPI from FusionSolar...');
      fetchKPI();
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
  });
