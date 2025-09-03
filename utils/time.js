// utils/time.js
const { DateTime } = require('luxon');
const TZ = 'Asia/Bangkok';

const nowBkk = () => DateTime.now().setZone(TZ);
const startOfTodayBkk = () => nowBkk().startOf('day');
const startOfTomorrowBkk = () => nowBkk().plus({ days: 1 }).startOf('day');
const ymdToBkkStartDate = (ymd) =>
  DateTime.fromISO(ymd, { zone: TZ }).startOf('day').toJSDate();

const fmtYYYYMMDD = (dt) => DateTime.fromJSDate(dt, { zone: TZ }).toFormat('yyyy-LL-dd');

module.exports = {
  TZ,
  nowBkk,
  startOfTodayBkk,
  startOfTomorrowBkk,
  ymdToBkkStartDate,
  fmtYYYYMMDD,
};
