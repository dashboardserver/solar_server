const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const KPI = require('../models/KPI');
require('dotenv').config();

// Helpers (Asia/Bangkok)
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
function bkkYYYYMMDD(d) { return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); }
function startOfBkkDayUTC(dateUtc = new Date()) {
  const [y, m, day] = bkkYYYYMMDD(dateUtc).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day) - BKK_OFFSET_MS);
}
function startOfBkkTomorrowUTC() { return new Date(startOfBkkDayUTC().getTime() + 24 * 60 * 60 * 1000); }

// Common headers
const BASE_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json;charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
};

// Rate-limit
function isRateLimitedPayload(payload) {
  const s = (payload?.failCode || payload?.data || '').toString();
  return s.includes('ACCESS_FREQUENCY_IS_TOO_HIGH');
}
function isJsonParseError(payload) {
  return (
    payload?.exceptionType === 'ROA_EXFRAME_EXCEPTION' &&
    Array.isArray(payload?.reasonArgs) &&
    payload.reasonArgs.join(' ').toLowerCase().includes('json parse error')
  );
}

// ลองหลายฟอร์แมต + หลาย endpoint
async function fetchKpiFlexible(client, headers, code, sourceKey='default') {
  const scalar = String(Array.isArray(code) ? code[0] : code).trim();

  const post = async (url, body, via) => {
    try {
      const res = await client.post(url, body, { headers });
      const data = res?.data;

      if (isRateLimitedPayload(data)) return { kind: 'rate', via };
      if (isJsonParseError(data))     return { kind: 'jsonerr', via, data };

      const map =
        data?.data?.[0]?.dataItemMap ||
        data?.dataItemMap ||
        data?.data?.data?.[0]?.dataItemMap;

      if (map) return { kind: 'ok', via, dataItemMap: map, data };
      return { kind: 'noop', via, data };
    } catch (e) {
      console.error(`[${sourceKey}] ${via} error (truncated):`, e?.response?.data || e.message);
      throw e;
    }
  };

  // realKpi — stationCodes
  let r = await post('/thirdData/getStationRealKpi', { stationCodes: scalar }, 'realKpi:stationCodes:scalar');
  if (r.kind === 'rate') return { rateLimited: true, via: r.via };
  if (r.kind === 'ok')   return { dataItemMap: r.dataItemMap, via: r.via };

  // realKpi — plantCodes
  r = await post('/thirdData/getStationRealKpi', { plantCodes: scalar }, 'realKpi:plantCodes:scalar');
  if (r.kind === 'rate') return { rateLimited: true, via: r.via };
  if (r.kind === 'ok')   return { dataItemMap: r.dataItemMap, via: r.via };

  // currentKpi stationCodes fallback
  r = await post('/thirdData/getStationCurrentKpi', { stationCodes: scalar }, 'currentKpi:stationCodes:scalar');
  if (r.kind === 'rate') return { rateLimited: true, via: r.via };
  if (r.kind === 'ok')   return { dataItemMap: r.dataItemMap, via: r.via };

  console.log(`[${sourceKey}] raw (last via=${r.via}) truncated:`, JSON.stringify(r.data, null, 2).slice(0, 600));
  return { dataItemMap: null, via: 'not-found' };
}

async function fetchKPI(cfg, saveToDB = true) {
  const BASE_URL   = cfg?.baseUrl    || process.env.FUSION_BASE_URL;
  const USERNAME   = cfg?.userName   || process.env.FUSION_USERNAME;
  const PASSWORD   = cfg?.systemCode || process.env.FUSION_PASSWORD;
  const PLANT_NAME = cfg?.plantName  || process.env.FUSION_PLANT_NAME || '';
  const SOURCE_KEY = cfg?.sourceKey  || 'default';

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
    // ===== LOGIN WITH DEBUG =====
    console.log(`[${SOURCE_KEY}] 🔐 Attempting login with username: ${USERNAME.substring(0, 3)}***`);
    
    const loginResponse = await client.post('/thirdData/login', { 
      userName: USERNAME, 
      systemCode: PASSWORD 
    });
    
    // ดู response หลัง login
    console.log(`[${SOURCE_KEY}] 📥 Login response:`, JSON.stringify({
      success: loginResponse.data?.success,
      failCode: loginResponse.data?.failCode,
      data: loginResponse.data?.data
    }, null, 2));
    
    // ดู cookies ที่ได้
    const allCookies = jar.getCookiesSync(BASE_URL);
    console.log(`[${SOURCE_KEY}] 🍪 Cookies after login (${allCookies.length}):`, 
      allCookies.map(c => `${c.key}=${c.value.substring(0, 15)}...`)
    );
    
    // ตรวจสอบว่า login สำเร็จจริงๆ
    if (loginResponse.data?.success === false) {
      throw new Error(`Login failed: ${loginResponse.data?.failCode || loginResponse.data?.data || 'Unknown error'}`);
    }

    // ===== XSRF TOKEN =====
    const token = jar.getCookiesSync(BASE_URL).find(c => c.key === 'XSRF-TOKEN')?.value;
    if (!token) {
      console.error(`[${SOURCE_KEY}] ❌ XSRF-TOKEN NOT FOUND!`);
      console.error(`[${SOURCE_KEY}] Available cookies:`, allCookies.map(c => c.key));
      throw new Error('XSRF-TOKEN not found after login');
    }
    
    console.log(`[${SOURCE_KEY}] ✅ XSRF-TOKEN found: ${token.substring(0, 15)}...`);
    const headers = { ...BASE_HEADERS, 'XSRF-TOKEN': token };

    // list stations
    const stationRes = await client.post('/thirdData/getStationList', {}, { headers });
    if (isRateLimitedPayload(stationRes.data)) {
      console.error(`❌ [${SOURCE_KEY}] Rate limited at getStationList`);
      return { rateLimited: true };
    }
    const ok = (typeof stationRes.data?.success === 'boolean') ? stationRes.data.success : true;
    if (!ok) throw new Error('getStationList failed');

    let stations = [];
    if (Array.isArray(stationRes.data?.data)) stations = stationRes.data.data;
    else if (Array.isArray(stationRes.data?.data?.data)) stations = stationRes.data.data.data;
    if (!stations.length) throw new Error('No station visible for this API account');

    // find station (normalize)
    const norm = (s='') => s.toString().toLowerCase().normalize('NFKC').replace(/\s+/g,' ').trim();
    const target = norm(PLANT_NAME);
    let plant = stations.find(st => norm(st.stationName || st.name) === target)
            || stations.find(st => norm(st.stationName || st.name).includes(target));
    if (!plant) {
      console.log('ชื่อสถานีที่เห็นทั้งหมด:');
      stations.forEach(st => console.log('-', st.stationName || st.name));
      throw new Error(`No station matched by name: ${PLANT_NAME}`);
    }

    const stationCode = plant.stationCode || plant.stationId || plant.id;
    const plantCode   = plant.plantCode  || plant.plantId;
    const stationName = plant.stationName || plant.name || '';
    if (!stationCode) throw new Error('Station code missing');

    // KPI (ลองหลายฟอร์แมต + endpoint)
    let out = await fetchKpiFlexible(client, headers, stationCode, SOURCE_KEY);
    if (out.rateLimited) {
      console.error(`❌ [${SOURCE_KEY}] Rate limited at KPI fetch (${out.via})`);
      return { rateLimited: true };
    }

    // บาง tenant ต้องใช้ plantCode จริง ๆ
    if (!out.dataItemMap && !out.rateLimited && plantCode) {
      const alt = await fetchKpiFlexible(client, headers, plantCode, SOURCE_KEY);
      if (alt.rateLimited) return { rateLimited: true };
      if (alt.dataItemMap) out = { ...alt, via: `${alt.via}+plantCode` };
    }

    if (!out.dataItemMap) throw new Error('KPI dataItemMap not found');

    const dataItemMap = out.dataItemMap;
    console.log(`[${SOURCE_KEY}] KPI via=${out.via} stationCode=${stationCode}`);

    const result = {
      day_income: dataItemMap.day_income ?? 0,
      total_income: dataItemMap.total_income ?? 0,
      day_power: dataItemMap.day_power ?? 0,
      month_power: dataItemMap.month_power ?? 0,
      total_power: dataItemMap.total_power ?? 0,
      co2_avoided: (dataItemMap.total_power ?? 0) * 0.5,
      equivalent_trees: (dataItemMap.total_power ?? 0) * 0.0333,
      timestamp: new Date(),
    };
    console.log(`✅ [${SOURCE_KEY}] KPI:`, result);

    if (saveToDB) {
      const appliesToDate = startOfBkkTomorrowUTC();
      const dateStr = bkkYYYYMMDD(appliesToDate);
      const fetchedAt = new Date();

      await KPI.updateOne(
        { appliesToDate, sourceKey: SOURCE_KEY },
        {
          $set: {
            sourceKey: SOURCE_KEY,
            stationCode: stationCode.toString(),
            stationName: stationName || '(unknown)',
            date: dateStr,
            appliesToDate,
            fetchedAt,
            ...result,
          },
        },
        { upsert: true }
      );
      console.log(`💾 [${SOURCE_KEY}] Saved KPI for ${dateStr} / appliesToDate=${appliesToDate.toISOString()}`);
    }

    return { sourceKey: SOURCE_KEY, stationCode, stationName, ...result };
  } catch (err) {
    const payload = err?.response?.data;
    const msg = (payload?.failCode || payload?.data || err?.message || '').toString();

    if (msg.includes('ACCESS_FREQUENCY_IS_TOO_HIGH')) {
      console.error(`❌ [${SOURCE_KEY}] Rate limited: ${msg}`);
      return { rateLimited: true };
    }

    console.error(`❌ [${SOURCE_KEY}] KPI Fetch Error:`, payload || err.message || err);
    return null;
  }
}
module.exports = fetchKPI;