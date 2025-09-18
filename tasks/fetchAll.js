require('dotenv').config();
const fetchKPI = require('./fetchKPI');
const KPI = require('../models/KPI');

// Cooldown กันรันถี่เกิน
let lastRunAt = 0;
const COOLDOWN_MS = parseInt(process.env.FETCHALL_COOLDOWN_MS || '600000', 10);

function buildJobsFromEnv() {
  const A = (process.env.FUSION_A_USERNAME && process.env.FUSION_A_PASSWORD && process.env.FUSION_A_PLANT_NAME) ? {
    sourceKey:  process.env.FUSION_A_SOURCE || 'A',
    baseUrl:    process.env.FUSION_BASE_URL,
    userName:   process.env.FUSION_A_USERNAME,
    systemCode: process.env.FUSION_A_PASSWORD,
    plantName:  process.env.FUSION_A_PLANT_NAME,
  } : null;

  const B = (process.env.FUSION_B_USERNAME && process.env.FUSION_B_PASSWORD && process.env.FUSION_B_PLANT_NAME) ? {
    sourceKey:  process.env.FUSION_B_SOURCE || 'B',
    baseUrl:    process.env.FUSION_BASE_URL,
    userName:   process.env.FUSION_B_USERNAME,
    systemCode: process.env.FUSION_B_PASSWORD,
    plantName:  process.env.FUSION_B_PLANT_NAME,
  } : null;

  return [A, B].filter(Boolean);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// เวลาไทย → UTC ของ “เที่ยงคืนวันพรุ่งนี้ (ไทย)”
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
function bkkYYYYMMDD(d) { return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); }
function startOfBkkDayUTC(dateUtc = new Date()) {
  const [y,m,day] = bkkYYYYMMDD(dateUtc).split('-').map(Number);
  return new Date(Date.UTC(y, m-1, day) - BKK_OFFSET_MS);
}
function startOfBkkTomorrowUTC() {
  return new Date(startOfBkkDayUTC().getTime() + 24*60*60*1000);
}

// กันตั้ง retry ซ้ำในวันเดียวกันต่อสถานี
const retryFlags = new Map();
function dayKey(date = new Date()) { return bkkYYYYMMDD(date); }

// รับ delayMs และแก้ log ให้ตรงเวลา
async function scheduleRetry(cfg, saveToDB, delayMs = 60 * 60 * 1000) { // default 60 นาที
  const key = `${cfg.sourceKey}:${dayKey()}`;
  if (retryFlags.get(key)) {
    console.log(`↩︎ [${cfg.sourceKey}] Retry already scheduled for today, skip`);
    return;
  }
  retryFlags.set(key, true);

  console.log(`⏲️  [${cfg.sourceKey}] Schedule retry in ${Math.round(delayMs/60000)} minutes...`);
  setTimeout(async () => {
    try {
      console.log(`🔁 [${cfg.sourceKey}] Retry fetch now`);
      //  เช็คถ้ามีแล้วก็ไม่ดึง
      const tomorrow = startOfBkkTomorrowUTC();
      const exists = await KPI.exists({ sourceKey: cfg.sourceKey, appliesToDate: tomorrow });
      if (exists) {
        console.log(`✅ [${cfg.sourceKey}] Already present for tomorrow — skip retry fetch`);
        return;
      }
      await fetchKPI(cfg, saveToDB);
    } catch (e) {
      console.error(`❌ [${cfg.sourceKey}] Retry error:`, e?.message || e);
    }
  }, delayMs);
}

async function fetchAll(saveToDB = true) {
  // Global cooldown
  const now = Date.now();
  if (now - lastRunAt < COOLDOWN_MS) {
    const left = Math.ceil((COOLDOWN_MS - (now - lastRunAt)) / 1000);
    console.log(`⏳ fetchAll cooldown: skip (wait ${left}s)`);
    return;
  }
  lastRunAt = now;

  const jobs = buildJobsFromEnv();
  if (jobs.length === 0) {
    console.warn('⚠️ No station jobs defined in .env (use FUSION_A_* / FUSION_B_*)');
    return;
  }

  const tomorrow = startOfBkkTomorrowUTC();

  for (const cfg of jobs) {
    // เช็คก่อนถ้ามีของพรุ่งนี้แล้ว ไม่ต้องยิง API
    const exists = await KPI.exists({ sourceKey: cfg.sourceKey, appliesToDate: tomorrow });
    if (exists) {
      console.log(`🟡 [${cfg.sourceKey}] KPI for tomorrow already exists — skip fetch`);
    } else {
      const res = await fetchKPI(cfg, saveToDB);

      if (!res) {
        // error ทั่วไป retry แบบ backoff ยาวขึ้น (60 นาที)
        await scheduleRetry(cfg, saveToDB, 60 * 60 * 1000);
      } else if (res.rateLimited) {
        // เจอ rate-limit ไม่ retry (ปล่อยให้ถึงรอบ cron ครั้งถัดไป)
        console.log(`[${cfg.sourceKey}] Skip retry due to rate limit (wait for next cron).`);
      }
      // กัน rate-limit หน่วงระหว่างสถานี
      await sleep(30000);
    }
  }
}

module.exports = fetchAll;
