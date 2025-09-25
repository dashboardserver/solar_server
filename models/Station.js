const mongoose = require('mongoose');

const StationSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },   // 'seafdec', 'A1', 'B1', 'C1'
  name: { type: String, required: true },                // ชื่อที่โชว์บนเว็บ
  openingDate: { type: Date, default: null },            // วันเปิดทำการ (ตั้งจากแอดมิน)
}, { timestamps: true });

StationSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('Station', StationSchema);
