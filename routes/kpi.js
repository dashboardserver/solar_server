const express = require('express');
const KPI = require('../models/KPI');

const router = express.Router();

// Helpers: เวลาไทย
const BKK = 'Asia/Bangkok';
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

// คืน Date (UTC) ของ เที่ยงคืนเวลาไทย ของวันที่ที่ระบุ
function startOfBkkDayUTC(d = new Date()) {
  const [y, m, day] = d.toLocaleDateString('en-CA', { timeZone: BKK }).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day) - BKK_OFFSET_MS);
}

// คืนสตริง YYYY-MM-DD (เวลาไทย)
function bkkTodayStr(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: BKK });
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
// แสดงrecord ล่าสุดที่ไม่เกินวันนี้ (เวลาไทย)
router.get('/:sourceKey/today', async (req, res) => {
  try {
    const { sourceKey } = req.params;
    const todayStr = bkkTodayStr(new Date());

    // หาrecordของ "วันนี้" ตาม field `date` ก่อน
    let doc = await KPI.findOne({ sourceKey, date: todayStr }, PROJECTION).lean();

    // ถ้ายังไม่มี ให้หาrecordล่าสุดที่ `date <= วันนี้`
    if (!doc) {
      doc = await KPI.findOne(
        { sourceKey, date: { $lte: todayStr } },
        PROJECTION
      ).sort({ date: -1 }).lean();
    }

    if (!doc) return res.status(404).send('Not found');
    return res.json(doc);
  } catch (e) {
    console.error('kpi today error:', e);
    res.status(500).send('Server error');
  }
});

// GET /api/kpi/:sourceKey/by-date?date=YYYY-MM-DD
// ดึงตามวันที่ที่ผู้ใช้เลือก (เวลาไทย)
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
