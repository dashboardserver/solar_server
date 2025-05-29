const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const MONGO_URI = 'mongodb+srv://admin:admin1234@solar-platform.ui9yaoe.mongodb.net/?retryWrites=true&w=majority&appName=solar-platform';

mongoose.connect(MONGO_URI)
  .then(async () => {
    await User.deleteOne({ username: 'adminsolar' }); // ลบของเก่า
    const hashed = await bcrypt.hash('@admin1234', 10);
    await User.create({
      username: 'adminsolar',
      password: hashed,
      role: 'admin',
      assignedDashboard: 'A1' // ✅ ใส่ค่าให้เรียบร้อย
    });

    console.log('✅ adminsolar created');
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('❌ Error:', err);
  });
