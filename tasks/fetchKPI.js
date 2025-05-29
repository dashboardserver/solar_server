// Fetch KPI data from FusionSolar and save to MongoDB
const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const KPI = require('../models/KPI');
require('dotenv').config();

const BASE_URL = 'https://sg5.fusionsolar.huawei.com';
const USERNAME = 'yipintsoi';
const PASSWORD = '0rpkx2stul6czxo13pq6ckho';
const PLANT_NAME = 'STN-03423_ASL2411-00637_บริษัท ยิบอินซอย จำกัด';

async function fetchKPI(saveToDB = false) {
  console.log('⏳ Fetching KPI from FusionSolar...');

  try {
    const jar = new tough.CookieJar();
    const client = wrapper(axios.create({ jar, withCredentials: true }));

    await client.post(`${BASE_URL}/thirdData/login`, {
      userName: USERNAME,
      systemCode: PASSWORD,
    });

    const token = jar.getCookiesSync(BASE_URL).find(c => c.key === 'XSRF-TOKEN')?.value;
    if (!token) throw new Error('❌ XSRF-TOKEN not found');

    const headers = { 'XSRF-TOKEN': token, 'Content-Type': 'application/json' };

    const stationRes = await client.post(`${BASE_URL}/thirdData/getStationList`, {}, { headers });

    if (!stationRes.data.success || typeof stationRes.data.data !== 'object') {
      console.error('❌ FusionSolar error (getStationList):', stationRes.data.data);
      throw new Error('⛔️ API ถูกบล็อกชั่วคราว หรือข้อมูลผิด');
    }

    const rawStations = stationRes.data.data;
    const stations = Array.isArray(rawStations) ? rawStations : Object.values(rawStations || {});
    const plant = stations.find(st => st.stationName === PLANT_NAME);
    if (!plant) throw new Error(`❌ ไม่พบโรงงานชื่อ: ${PLANT_NAME}`);
    const stationCode = plant.stationCode;

    const kpiRes = await client.post(`${BASE_URL}/thirdData/getStationRealKpi`,
      { stationCodes: stationCode }, { headers });

    const data = kpiRes.data?.data?.[0]?.dataItemMap;
    if (!data) throw new Error('❌ ไม่พบข้อมูล KPI');

    const result = {
      total_income: data.total_income ?? 0,
      total_power: data.total_power ?? 0,
      day_power: data.day_power ?? 0,
      month_power: data.month_power ?? 0,
      day_income: data.day_income ?? 0,
      day_use_energy: data.day_use_energy ?? 0,
      day_on_grid_energy: data.day_on_grid_energy ?? 0,
      timestamp: new Date()
    };

    console.log('✅ KPI Data:', result);

    if (saveToDB) {
      const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const existing = await KPI.findOne({ date: today });
      if (existing) {
        console.log('✅ Already saved for today, skip saving.');
        return result;
      }

      await KPI.create({ date: today, ...result });
      console.log(`✅ KPI saved to MongoDB for ${today}`);
    }

    return result;
  } catch (err) {
    console.error('❌ KPI Fetch Error:', err.message);
    return null;
  }
}

module.exports = fetchKPI;
