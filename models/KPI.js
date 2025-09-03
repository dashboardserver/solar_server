const mongoose = require('mongoose');
const KPISchema = new mongoose.Schema(
  {
    date: String,                 
    total_income: Number,
    total_power: Number,
    day_power: Number,
    month_power: Number,
    day_income: Number,
    co2_avoided: Number,
    equivalent_trees: Number,
    appliesToDate: { type: Date, required: true },
    fetchedAt: { type: Date, default: Date.now }, 
  },
  { timestamps: true }
);
KPISchema.index({ appliesToDate: 1 }, { unique: true });
module.exports = mongoose.model('KPI', KPISchema);
