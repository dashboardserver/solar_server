const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password, expectedDashboard } = req.body;

  try {
    const user = await User.findOne({ username });
    
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    // 🛡️ เพิ่มจุดนี้ — ถ้าเป็น user และ dashboard ไม่ตรง
    if (
      user.role === 'user' &&
      user.assignedDashboard !== expectedDashboard
    ) {
      return res.status(403).json({ message: 'Permission denied: wrong dashboard' });
    }

    const token = jwt.sign({
      id: user._id,
      username: user.username,
      role: user.role,
      dashboard: user.assignedDashboard
    }, JWT_SECRET, { expiresIn: '2h' });

    res.json({ token, role: user.role, dashboard: user.assignedDashboard });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

// POST /api/auth/create-user (admin only)
router.post('/create-user', async (req, res) => {
  console.log('📦 create-user request body:', req.body);
  const { username, password, assignedDashboard } = req.body;

  if (!username || !password || !assignedDashboard) {
    return res.status(400).json({ message: 'Missing fields' });
  }

  try {
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ message: 'User already exists' });

    const hashed = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      password: hashed,
      role: 'user',
      assignedDashboard
    });

    await newUser.save();
    res.json({ message: 'User created' });
  } catch (err) {
    res.status(500).json({ message: 'Create failed', error: err.message });
  }
});

// DELETE /api/auth/delete-user
router.delete('/delete-user/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const deleted = await User.findOneAndDelete({ username, role: 'user' });

    if (!deleted) {
      return res.status(404).json({ message: 'User not found or cannot delete admin' });
    }

    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed', error: err.message });
  }
});

// GET /api/auth/list-users
router.get('/list-users', async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }, 'username assignedDashboard');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Fetch users failed', error: err.message });
  }
});


module.exports = router;
