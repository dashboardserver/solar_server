// Fetch KPI data from FusionSolar and save to MongoDB (timezone fixed + upsert, original result shape)
const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const KPI = require('../models/KPI');
require('dotenv').config();

const BASE_URL   = process.env.FUSION_BASE_URL;
const USERNAME   = process.env.FUSION_USERNAME;
const PASSWORD   = process.env.FUSION_PASSWORD;
const PLANT_NAME = process.env.FUSION_PLANT_NAME;

// Helper: 'YYYY-MM-DD' in Asia/Bangkok
function todayYYYYMMDD_BKK() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

/**
 * Fetch KPI and optionally save to DB.
 * @param {boolean} saveToDB - default true to ensure DB is updated unless explicitly disabled.
 * @returns {Promise<Object|null>} result with original shape or null on error.
 */
async function fetchKPI(saveToDB = true) {
  console.log('⏳ Fetching KPI from FusionSolar...');

  if (!BASE_URL || !USERNAME || !PASSWORD) {
    console.error('❌ Missing env: FUSION_BASE_URL / FUSION_USERNAME / FUSION_PASSWORD');
    return null;
  }

  const jar = new tough.CookieJar();
  const client = wrapper(axios.create({ baseURL: BASE_URL, jar, withCredentials: true }));

  try {
    // 1) Login
    await client.post(`/thirdData/login`, {
      userName: USERNAME,
      systemCode: PASSWORD,
    });

    // 2) XSRF token
    const token = jar.getCookiesSync(BASE_URL).find(c => c.key === 'XSRF-TOKEN')?.value;
    if (!token) throw new Error('XSRF-TOKEN not found after login');
    const headers = { 'XSRF-TOKEN': token, 'Content-Type': 'application/json' };

    // 3) Get station list, find our plant
    const stationRes = await client.post(`/thirdData/getStationList`, {}, { headers });
    if (!stationRes.data?.success) throw new Error('getStationList failed');

    // Tolerate different shapes from API
    let stations = [];
    if (Array.isArray(stationRes.data?.data)) stations = stationRes.data.data;
    else if (Array.isArray(stationRes.data?.data?.data)) stations = stationRes.data.data.data;
    else stations = [];

    const plant = stations.find(st => (st.stationName || st.name) === PLANT_NAME) || stations[0];
    if (!plant) throw new Error(`No station found (PLANT_NAME=${PLANT_NAME})`);

    const stationCode = plant.stationCode || plant.id || plant.stationId;
    if (!stationCode) throw new Error('Station code missing');

    // 4) Get real KPI for station
    // Note: endpoint name may vary by region/version. Adjust if your server uses a different path.
    const kpiRes = await client.post(`/thirdData/getStationRealKpi`, { stationCodes: stationCode }, { headers });
    const dataItemMap = kpiRes.data?.data?.[0]?.dataItemMap;
    if (!dataItemMap) throw new Error('KPI dataItemMap not found');

    // 5) Build result with ORIGINAL SHAPE
    const result = {
      day_income: dataItemMap.day_income ?? 0,
      total_income: dataItemMap.total_income ?? 0,
      day_power: dataItemMap.day_power ?? 0,
      month_power: dataItemMap.month_power ?? 0,
      total_power: dataItemMap.total_power ?? 0,
      co2_avoided: (dataItemMap.total_power ?? 0) * 0.5,
      equivalent_trees: (dataItemMap.total_power ?? 0) * 0.0333,
      timestamp: new Date()
    };

    console.log('✅ KPI result (original shape):', result);

    if (saveToDB) {
      const today = todayYYYYMMDD_BKK();
      await KPI.updateOne(
        { date: today },                         // upsert by date (1 record per day)
        { $set: { date: today, ...result } },
        { upsert: true }
      );
      console.log(`✅ Saved KPI for ${today}`);
    } else {
      console.log('ℹ️ saveToDB=false → skip DB write');
    }

    return result;
  } catch (err) {
    console.error('❌ KPI Fetch Error:', err?.response?.data || err.message || err);
    return null;
  }
}

// Run directly: node fetchKPI.fixed2.js
if (require.main === module) {
  fetchKPI(true).then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = fetchKPI;
