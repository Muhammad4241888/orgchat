// middleware/auth.js
const jwt = require('jsonwebtoken');
const { User } = require('../models');

const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Not authenticated' });
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(id).select('-password');
    if (!user) return res.status(401).json({ message: 'User not found' });
    if (user.status === 'banned') return res.status(403).json({ message: 'Account banned' });
    if (user.status === 'pending') return res.status(403).json({ message: 'Account pending approval', pending: true });
    req.user = user;
    next();
  } catch { res.status(401).json({ message: 'Invalid token' }); }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  next();
};

const managerUp = (req, res, next) => {
  if (!['admin','manager'].includes(req.user?.role)) return res.status(403).json({ message: 'Manager or admin only' });
  next();
};

const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const verifySocket = (token) => {
  try { return jwt.verify(token, process.env.JWT_SECRET); }
  catch { return null; }
};

module.exports = { protect, adminOnly, managerUp, sign, verifySocket };