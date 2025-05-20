const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User'); 

// เชื่อมต่อ MongoDB
mongoose.connect('mongodb+srv://solar-admin:DBsolar17052568@cluster0.rfnouhn.mongodb.net/solar-dashboard?retryWrites=true&w=majority&appName=Cluster0')
  .then(async () => {
    const hashedPassword = await bcrypt.hash('@admin1234', 10);

    const existing = await User.findOne({ username: 'adminsolar' });
    if (existing) {
      console.log('⚠️ adminsolar already exists');
    } else {
      await User.create({
        username: 'adminsolar',
        password: hashedPassword,
        role: 'admin'
      });
      console.log('✅ Admin created: adminsolar / @admin1234');
    }

    mongoose.disconnect();
  })
  .catch((err) => console.error('❌ MongoDB error:', err));
