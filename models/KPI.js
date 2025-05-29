// server/models/KPI.js
const mongoose = require('mongoose');

const KPISchema = new mongoose.Schema({
  date: String,
  total_income: Number,
  total_power: Number,
  day_power: Number,
  month_power: Number,
  day_income: Number,
  co2_avoided: Number,          
  equivalent_trees: Number       
});

module.exports = mongoose.model('KPI', KPISchema);
