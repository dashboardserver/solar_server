// tasks/fetchKPI.js
const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const KPI = require('../models/KPI');
require('dotenv').config();

// ======= ENV เดิม (คงไว้) =======
const BASE_URL   = process.env.FUSION_BASE_URL;
const USERNAME   = process.env.FUSION_USERNAME;
const PASSWORD   = process.env.FUSION_PASSWORD;
const PLANT_NAME = process.env.FUSION_PLANT_NAME;

// ======= Helpers เวลาแบบไม่พึ่ง lib (โซน Asia/Bangkok) =======
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7
function bkkYYYYMMDD(d) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // 'YYYY-MM-DD'
}
function startOfBkkDayUTC(dateUtc = new Date()) {
  const ymd = bkkYYYYMMDD(dateUtc).split('-').map(Number); // [Y,M,D] ของ "วันนี้(ไทย)"
  const utcMidnightOfBkkDay = Date.UTC(ymd[0], ymd[1]-1, ymd[2]) - BKK_OFFSET_MS;
  return new Date(utcMidnightOfBkkDay);
}
function startOfBkkTomorrowUTC() {
  const todayStartUTC = startOfBkkDayUTC(new Date());
  return new Date(todayStartUTC.getTime() + 24*60*60*1000);
}

// ======= ดึง KPI จาก FusionSolar (คงลอจิกเดิม) =======
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
    await client.post(`/thirdData/login`, { userName: USERNAME, systemCode: PASSWORD });

    // 2) XSRF
    const token = jar.getCookiesSync(BASE_URL).find(c => c.key === 'XSRF-TOKEN')?.value;
    if (!token) throw new Error('XSRF-TOKEN not found after login');
    const headers = { 'XSRF-TOKEN': token, 'Content-Type': 'application/json' };

    // 3) หา station
    const stationRes = await client.post(`/thirdData/getStationList`, {}, { headers });
    if (!stationRes.data?.success) throw new Error('getStationList failed');

    let stations = [];
    if (Array.isArray(stationRes.data?.data)) stations = stationRes.data.data;
    else if (Array.isArray(stationRes.data?.data?.data)) stations = stationRes.data.data.data;

    const plant = stations.find(st => (st.stationName || st.name) === PLANT_NAME) || stations[0];
    if (!plant) throw new Error(`No station found (PLANT_NAME=${PLANT_NAME})`);

    const stationCode = plant.stationCode || plant.id || plant.stationId;
    if (!stationCode) throw new Error('Station code missing');

    // 4) KPI จริง
    const kpiRes = await client.post(`/thirdData/getStationRealKpi`, { stationCodes: stationCode }, { headers });
    const dataItemMap = kpiRes.data?.data?.[0]?.dataItemMap;
    if (!dataItemMap) throw new Error('KPI dataItemMap not found');

    // 5) รูปแบบผลลัพธ์ "เหมือนเดิม"
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
      // ===== จุดสำคัญ: เซฟเป็น "วันพรุ่งนี้" =====
      const appliesToDate = startOfBkkTomorrowUTC();     // Date (UTC) ที่แทน "พรุ่งนี้ 00:00 (ไทย)"
      const dateStr       = bkkYYYYMMDD(appliesToDate);  // เก็บ 'date' (string) = YYYY-MM-DD ของพรุ่งนี้
      const fetchedAt     = new Date();                  // เวลาดึงจริง (วันนี้)

      await KPI.updateOne(
        { appliesToDate },                               // 1 record ต่อวัน
        { $set: { date: dateStr, appliesToDate, fetchedAt, ...result } },
        { upsert: true }
      );
      console.log(`✅ Saved KPI for tomorrow (${dateStr}) / appliesToDate=${appliesToDate.toISOString()}`);
    } else {
      console.log('ℹ️ saveToDB=false → skip DB write');
    }

    return result;
  } catch (err) {
    console.error('❌ KPI Fetch Error:', err?.response?.data || err.message || err);
    return null;
  }
}

// ให้ server เรียกใช้ได้
module.exports = fetchKPI;
