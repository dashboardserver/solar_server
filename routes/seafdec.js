const express = require('express');
const router = express.Router();
const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const KPI = require('../models/KPI');

const BASE_URL = 'https://sg5.fusionsolar.huawei.com';
const USERNAME = 'yipintsoi';
const PASSWORD = '0rpkx2stul6czxo13pq6ckho';
const PLANT_NAME = 'STN-03423_ASL2411-00637_บริษัท ยิบอินซอย จำกัด';

// ✅ ดึงแบบ real-time (ไม่ได้เก็บ)
router.get('/kpi', async (req, res) => {
    try {
        const jar = new tough.CookieJar();
        const client = wrapper(axios.create({ jar, withCredentials: true }));

        const loginRes = await client.post(`${BASE_URL}/thirdData/login`, {
            userName: USERNAME,
            systemCode: PASSWORD,
        });

        const token = jar.getCookiesSync(BASE_URL).find(c => c.key === 'XSRF-TOKEN')?.value;
        if (!token) throw new Error('❌ ไม่พบ XSRF-TOKEN');

        const headers = { 'XSRF-TOKEN': token, 'Content-Type': 'application/json' };

        const stationRes = await client.post(`${BASE_URL}/thirdData/getStationList`, {}, { headers });
        const stations = stationRes.data.data;
        const plant = stations.find(st => st.stationName === PLANT_NAME);
        if (!plant) throw new Error(`❌ ไม่พบโรงงาน: ${PLANT_NAME}`);
        const stationCode = plant.stationCode;

        const kpiRes = await client.post(`${BASE_URL}/thirdData/getStationRealKpi`,
            { stationCodes: stationCode }, { headers });

        const data = kpiRes.data.data?.[0]?.dataItemMap;
        if (!data) throw new Error('❌ ไม่มีข้อมูล KPI');

        res.json({
            total_income: data.total_income?.value || 0,
            total_power: data.total_power?.value || 0,
            day_power: data.day_power?.value || 0,
            month_power: data.month_power?.value || 0,
            day_income: data.day_income?.value || 0,
            day_use_energy: data.day_use_energy?.value || 0,
            day_on_grid_energy: data.day_on_grid_energy?.value || 0
        });

    } catch (err) {
        res.status(500).json({ message: 'FusionSolar fetch failed', error: err.message });
    }
});

// ✅ ดึงข้อมูลที่เก็บไว้ใน MongoDB วันนี้
router.get('/kpi/latest', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const kpi = await KPI.findOne({ date: today });
    if (!kpi) {
      return res.status(404).json({ message: 'ยังไม่มีข้อมูล KPI ของวันนี้' });
    }
    res.json(kpi);
  } catch (err) {
    console.error('❌ KPI Latest API Error:', err.message);
    res.status(500).json({ message: 'ไม่สามารถดึงข้อมูล KPI ล่าสุดได้', error: err.message });
  }
});

module.exports = router;
