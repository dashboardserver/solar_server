const express = require('express');
const router = express.Router();

const KPI = require('../models/KPI');

// ✅ ข้อมูล KPI ของวันนี้ (จากตัวแปร cached)
let cachedKPI = null;

router.get('/kpi/latest', (req, res) => {
  if (cachedKPI) {
    res.json(cachedKPI);
  } else {
    res.status(404).json({ message: 'No KPI available' });
  }
});

// ✅ ดึง KPI ย้อนหลังจาก MongoDB
router.get('/kpi/:date', async (req, res) => {
  const { date } = req.params;
  try {
    const kpi = await KPI.findOne({ date });
    if (!kpi) return res.status(404).json({ message: 'No data for selected date' });
    res.json(kpi);
  } catch (err) {
    res.status(500).json({ message: 'Fetch error', error: err.message });
  }
});

module.exports = {
  router,
  setKpiCache: (data) => { cachedKPI = data; }
};
