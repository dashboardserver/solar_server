// tasks/fetchAll.js
require('dotenv').config();
const fetchKPI = require('./fetchKPI');
const KPI = require('../models/KPI');

// Global cooldown (กันรันถี่เกิน)
let lastRunAt = 0;
const COOLDOWN_MS = parseInt(process.env.FETCHALL_COOLDOWN_MS || '600000', 10); // default 10 นาที

// retry เมื่อโดน rate-limit (4 ชม.)
const RATE_LIMIT_RETRY_MS = parseInt(process.env.RATE_LIMIT_RETRY_MS || '14400000', 10); // 4 hours

// Job builder from .env (รองรับ 2 สถานี)
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

// Bangkok day helpers
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
function bkkYYYYMMDD(d) { return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); }
function startOfBkkDayUTC(dateUtc = new Date()) {
  const [y,m,day] = bkkYYYYMMDD(dateUtc).split('-').map(Number);
  return new Date(Date.UTC(y, m-1, day) - BKK_OFFSET_MS);
}
function startOfBkkTomorrowUTC() {
  return new Date(startOfBkkDayUTC().getTime() + 24*60*60*1000);
}

// retry guard (วันละ 1 ครั้ง/สถานี)
const retryFlags = new Map();
function dayKey(date = new Date()) { return bkkYYYYMMDD(date); }

async function scheduleRetry(cfg, saveToDB, delayMs = 60 * 60 * 1000) {
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
    // หน่วงพิเศษ yipintsoi 90s เลี่ยงหน้าต่างพีก
    const key = (cfg.sourceKey || '').toLowerCase();
    const plant = (cfg.plantName || '').toLowerCase();
    if (key.includes('yip') || plant.includes('yip')) {
      console.log(`[${cfg.sourceKey}] extra wait 90s to avoid rate-limit window...`);
      await sleep(90_000);
    }

    // ถ้ามีของพรุ่งนี้แล้ว ไม่ต้องยิง
    const exists = await KPI.exists({ sourceKey: cfg.sourceKey, appliesToDate: tomorrow });
    if (exists) {
      console.log(`🟡 [${cfg.sourceKey}] KPI for tomorrow already exists — skip fetch`);
    } else {
      const res = await fetchKPI(cfg, saveToDB);

      if (!res) {
        // error ทั่วไป → retry มาตรฐาน 60 นาที
        await scheduleRetry(cfg, saveToDB, 60 * 60 * 1000);
      } else if (res.rateLimited) {
        // NEW: โดน rate-limit → ตั้ง retry หลัง 4 ชม. (หรือค่าที่ตั้งใน ENV)
        console.log(
          `[${cfg.sourceKey}] Rate limited → schedule retry in ${Math.round(RATE_LIMIT_RETRY_MS/3600000)} hours...`
        );
        await scheduleRetry(cfg, saveToDB, RATE_LIMIT_RETRY_MS);
      }
    }

    // หน่วงระหว่างสถานีทั่วไป 30s กัน burst
    await sleep(30_000);
  }
}

module.exports = fetchAll;
