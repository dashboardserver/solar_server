const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], required: true },
  assignedDashboard: { type: String, enum: ['seafdec', 'B1', 'C1', 'D1'], default: null }
});

module.exports = mongoose.model('User', userSchema);
