// tasks/fetchKPI.js
const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const KPI = require('../models/KPI');
require('dotenv').config();

// Helpers (Asia/Bangkok)
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
function bkkYYYYMMDD(d) { return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); }
function startOfBkkDayUTC(dateUtc = new Date()) {
  const [y,m,day] = bkkYYYYMMDD(dateUtc).split('-').map(Number);
  return new Date(Date.UTC(y, m-1, day) - BKK_OFFSET_MS);
}
function startOfBkkTomorrowUTC() { return new Date(startOfBkkDayUTC().getTime() + 24*60*60*1000); }

// ลองดึง KPI: ทดลองทั้ง plantCodes และ stationCodes (บาง tenant ใช้อย่างใดอย่างหนึ่ง)
async function fetchKpiFlexible(client, headers, code, sourceKey='default') {
  let res = await client.post('/thirdData/getStationRealKpi', { plantCodes: code }, { headers });
  let dataItemMap = res.data?.data?.[0]?.dataItemMap;
  if (!dataItemMap) {
    res = await client.post('/thirdData/getStationRealKpi', { stationCodes: code }, { headers });
    dataItemMap = res.data?.data?.[0]?.dataItemMap;
  }
  if (!dataItemMap) {
    console.log(`[${sourceKey}] raw response:`, JSON.stringify(res.data, null, 2));
  }
  return { res, dataItemMap };
}

/**
 * cfg = {
 *   baseUrl, userName, systemCode,
 *   plantName,   // ใช้ค้นสถานี (จำเป็น)
 *   sourceKey    // label เอกสารใน DB เช่น "yipintsoi" หรือ "SEAFDEC"
 * }
 */
async function fetchKPI(cfg, saveToDB = true) {
  const BASE_URL   = cfg?.baseUrl   || process.env.FUSION_BASE_URL;
  const USERNAME   = cfg?.userName  || process.env.FUSION_USERNAME;
  const PASSWORD   = cfg?.systemCode|| process.env.FUSION_PASSWORD;
  const PLANT_NAME = cfg?.plantName || process.env.FUSION_PLANT_NAME || '';
  const SOURCE_KEY = cfg?.sourceKey || 'default';

  console.log(`⏳ Fetching KPI from FusionSolar [${SOURCE_KEY}]...`);
  if (!BASE_URL || !USERNAME || !PASSWORD) {
    console.error('❌ Missing baseUrl/userName/systemCode');
    return null;
  }
  if (!PLANT_NAME) {
    console.error('❌ Missing plantName for this job');
    return null;
  }

  const jar = new tough.CookieJar();
  const client = wrapper(axios.create({ baseURL: BASE_URL, jar, withCredentials: true, timeout: 20000 }));

  try {
    // 1) login
    await client.post('/thirdData/login', { userName: USERNAME, systemCode: PASSWORD });

    // 2) xsrf
    const token = jar.getCookiesSync(BASE_URL).find(c => c.key === 'XSRF-TOKEN')?.value;
    if (!token) throw new Error('XSRF-TOKEN not found after login');
    const headers = { 'XSRF-TOKEN': token, 'Content-Type': 'application/json' };

    // 3) หา station จากชื่อ (บังคับใช้ชื่อเท่านั้น)
    const stationRes = await client.post('/thirdData/getStationList', {}, { headers }); // body ว่าง เหมือนที่คุณเคยใช้ได้
    const ok = (typeof stationRes.data?.success === 'boolean') ? stationRes.data.success : true;
    if (!ok) throw new Error('getStationList failed');

    let stations = [];
    if (Array.isArray(stationRes.data?.data)) stations = stationRes.data.data;
    else if (Array.isArray(stationRes.data?.data?.data)) stations = stationRes.data.data.data;

    if (!stations.length) throw new Error('No station visible for this API account');

    // ตรงเป๊ะก่อน ไม่เจอค่อย fuzzy (กันเคสสะกด/ช่องว่างเล็กน้อย)
    let plant = stations.find(st => (st.stationName || st.name) === PLANT_NAME);
    if (!plant) {
      const target = PLANT_NAME.toLowerCase();
      plant = stations.find(st => ((st.stationName || st.name || '')).toLowerCase() === target)
           || stations.find(st => ((st.stationName || st.name || '')).toLowerCase().includes(target));
    }
    if (!plant) {
      console.log('ชื่อสถานีที่เห็นทั้งหมด:');
      stations.forEach(st => console.log('-', st.stationName || st.name));
      throw new Error(`No station matched by name: ${PLANT_NAME}`);
    }

    const stationCode = plant.stationCode || plant.stationId || plant.id;
    const stationName = plant.stationName || plant.name || '';
    if (!stationCode) throw new Error('Station code missing');

    // 4) KPI (flexible)
    const { dataItemMap } = await fetchKpiFlexible(client, headers, stationCode, SOURCE_KEY);
    if (!dataItemMap) throw new Error('KPI dataItemMap not found');

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
    console.log(`✅ [${SOURCE_KEY}] KPI:`, result);

    if (saveToDB) {
      const appliesToDate = startOfBkkTomorrowUTC();
      const dateStr = bkkYYYYMMDD(appliesToDate);
      const fetchedAt = new Date();

      await KPI.updateOne(
        { appliesToDate, sourceKey: SOURCE_KEY },  // 1 เอกสาร/วัน/สถานี (แยกด้วย sourceKey)
        {
          $set: {
            sourceKey: SOURCE_KEY,
            stationCode: stationCode.toString(),
            stationName: stationName || '(unknown)',
            date: dateStr,
            appliesToDate,
            fetchedAt,
            ...result
          }
        },
        { upsert: true }
      );
      console.log(`💾 [${SOURCE_KEY}] Saved KPI for ${dateStr} / appliesToDate=${appliesToDate.toISOString()}`);
    }

    return { sourceKey: SOURCE_KEY, stationCode, stationName, ...result };
  } catch (err) {
    console.error(`❌ [${SOURCE_KEY}] KPI Fetch Error:`, err?.response?.data || err.message || err);
    return null;
  }
}
module.exports = fetchKPI;
