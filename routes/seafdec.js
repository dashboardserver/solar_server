// routes/seafdec.js
const express = require('express');
const router = express.Router();
const KPI = require('../models/KPI');

// Helpers เวลา Asia/Bangkok 
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
function bkkYYYYMMDD(d) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}
function startOfBkkDayUTC(dateUtc = new Date()) {
  const [y,m,day] = bkkYYYYMMDD(dateUtc).split('-').map(Number);
  return new Date(Date.UTC(y, m-1, day) - BKK_OFFSET_MS);
}

// date เก่า
let cachedKPI = null;

router.get('/kpi/latest', (req, res) => {
  if (cachedKPI) return res.json(cachedKPI);
  res.status(404).json({ message: 'No KPI available' });
});

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

//  แสดง “ของวันนี้”
router.get('/today', async (_req, res) => {
  const todayApplies = startOfBkkDayUTC(new Date()); // 00:00 วันนี้(ไทย) → Date(UTC)
  try {
    let doc = await KPI.findOne({ appliesToDate: todayApplies });
    if (!doc) {
      doc = await KPI
        .findOne({ appliesToDate: { $lte: todayApplies } })
        .sort({ appliesToDate: -1 });
    }
    if (!doc) {
      const ymdToday = bkkYYYYMMDD(new Date());
      doc = await KPI
        .findOne({ date: { $lte: ymdToday } })
        .sort({ date: -1 });
    }

    if (!doc) return res.status(404).json({ message: 'No data yet' });

    return res.json({
      date: doc.date,
      total_income: doc.total_income,
      total_power: doc.total_power,
      day_power: doc.day_power,
      month_power: doc.month_power,
      day_income: doc.day_income,
      co2_avoided: doc.co2_avoided,
      equivalent_trees: doc.equivalent_trees,
      appliesToDate: doc.appliesToDate,
      fetchedAt: doc.fetchedAt,
    });
  } catch (err) {
    res.status(500).json({ message: 'Fetch error', error: err.message });
  }
});

//  ระบุวันเอง 
router.get('/by-date', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ message: 'query param "date" is required (YYYY-MM-DD)' });

  try {
    // สร้าง appliesToDate ของวันนั้น (00:00 ไทย)
    const [y,m,day] = date.split('-').map(Number);
    const appliesTo = new Date(Date.UTC(y, m-1, day) - BKK_OFFSET_MS);

    let doc = await KPI.findOne({ appliesToDate: appliesTo });

    if (!doc) {
      doc = await KPI.findOne({ date });
    }

    if (!doc) return res.status(404).json({ message: 'No data for that date' });

    return res.json({
      date: doc.date,
      total_income: doc.total_income,
      total_power: doc.total_power,
      day_power: doc.day_power,
      month_power: doc.month_power,
      day_income: doc.day_income,
      co2_avoided: doc.co2_avoided,
      equivalent_trees: doc.equivalent_trees,
      appliesToDate: doc.appliesToDate,
      fetchedAt: doc.fetchedAt,
    });
  } catch (err) {
    res.status(500).json({ message: 'Fetch error', error: err.message });
  }
});

module.exports = {
  router,
  setKpiCache: (data) => { cachedKPI = data; }
};
