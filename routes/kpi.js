// routes/kpi.js
const express = require('express');
const KPI = require('../models/KPI');

const router = express.Router();

// helper: เวลาไทย
const BKK = 'Asia/Bangkok';
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
function startOfBkkDayUTC(d = new Date()) {
  const ymd = d.toLocaleDateString('en-CA', { timeZone: BKK }).split('-').map(Number);
  // เที่ยงคืนเวลาไทย ในรูป UTC
  return new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2]) - BKK_OFFSET_MS);
}
function startOfBkkTomorrowUTC(d = new Date()) {
  return new Date(startOfBkkDayUTC(d).getTime() + 24 * 60 * 60 * 1000);
}

const PROJECTION = {
  _id: 0,
  date: 1,
  day_income: 1,
  total_income: 1,
  day_power: 1,
  month_power: 1,
  total_power: 1,
  co2_avoided: 1,
  equivalent_trees: 1,
  sourceKey: 1,
  stationName: 1,
  stationCode: 1,
};

// GET /api/kpi/:sourceKey/today
// เซฟเป็นของพรุ่งนี้ (เวลาไทย) -> วันนี้ให้ดึง appliesToDate=พรุ่งนี้ 00:00(ไทย)

router.get('/:sourceKey/today', async (req, res) => {
  try {
    const { sourceKey } = req.params;
    const appliesTo = startOfBkkTomorrowUTC(new Date());

    let doc = await KPI.findOne({ sourceKey, appliesToDate: appliesTo }, PROJECTION).lean();

    if (!doc) {
      doc = await KPI.findOne({ sourceKey }, PROJECTION).sort({ appliesToDate: -1 }).lean();
    }

    if (!doc) return res.status(404).send('Not found');
    return res.json(doc);
  } catch (e) {
    console.error('kpi today error:', e);
    res.status(500).send('Server error');
  }
});

// GET /api/kpi/:sourceKey/by-date?date=YYYY-MM-DD
router.get('/:sourceKey/by-date', async (req, res) => {
  try {
    const { sourceKey } = req.params;
    const { date } = req.query;

    if (!date) return res.status(400).send('Missing date (YYYY-MM-DD)');

    let doc = await KPI.findOne({ sourceKey, date }, PROJECTION).lean();

    if (!doc) {
      const target = startOfBkkDayUTC(new Date(date + 'T00:00:00'));
      doc = await KPI.findOne({ sourceKey, appliesToDate: target }, PROJECTION).lean();
    }

    if (!doc) return res.status(404).send('Not found');
    return res.json(doc);
  } catch (e) {
    console.error('kpi by-date error:', e);
    res.status(500).send('Server error');
  }
});

module.exports = { router };
