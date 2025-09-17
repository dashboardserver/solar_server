const mongoose = require('mongoose');

const kpiSchema = new mongoose.Schema({
  sourceKey:   { type: String, required: true },  
  stationCode: { type: String, required: true },
  stationName: { type: String, required: true },

  date:          { type: String, required: true }, 
  appliesToDate: { type: Date,   required: true },
  fetchedAt:     { type: Date,   required: true },

  day_income:       Number,
  total_income:     Number,
  day_power:        Number,
  month_power:      Number,
  total_power:      Number,
  co2_avoided:      Number,
  equivalent_trees: Number,
}, { timestamps: true });

kpiSchema.index({ appliesToDate: 1, sourceKey: 1 }, { unique: true });

module.exports = mongoose.model('KPI', kpiSchema);
