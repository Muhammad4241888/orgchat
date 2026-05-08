// routes/auth.js
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const { User, Org, JoinReq } = require('../models');
const { protect, sign } = require('../middleware/auth');
const { activity } = require('../utils/logger');

const limiter = rateLimit({ windowMs: 15*60*1000, max: 20, message: { message: 'Too many attempts' } });

// GET /api/auth/org  — public org info for login screen
router.get('/org', async (req, res) => {
  try {
    let org = await Org.findOne();
    if (!org) org = await Org.create({});
    res.json({ appName: org.appName, orgName: org.orgName, primaryColor: org.primaryColor, allowedDomains: org.allowedDomains, requireApproval: org.requireApproval });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// POST /api/auth/signup
router.post('/signup', limiter, async (req, res) => {
  try {
    const { username, email, password, note } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: 'All fields required' });
    if (!validator.isEmail(email)) return res.status(400).json({ message: 'Invalid email' });
    if (password.length < 8) return res.status(400).json({ message: 'Password min 8 characters' });
    if (username.length < 3 || username.length > 30) return res.status(400).json({ message: 'Username 3-30 characters' });

    // Domain check
    const org = await Org.findOne();
    if (org?.allowedDomains?.length > 0) {
      const domain = email.split('@')[1]?.toLowerCase();
      if (!org.allowedDomains.map(d=>d.toLowerCase()).includes(domain)) {
        return res.status(400).json({ message: `Only @${org.allowedDomains.join(', @')} emails allowed` });
      }
    }

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(409).json({ message: 'Email or username already taken' });

    const count = await User.countDocuments();
    const isFirst = count === 0;

    const user = await User.create({
      username, email, password,
      role: isFirst ? 'admin' : 'user',
      status: isFirst ? 'active' : (org?.requireApproval ? 'pending' : 'active'),
      roomAccess: isFirst ? ['general'] : (org?.requireApproval ? [] : ['general'])
    });

    if (!isFirst && org?.requireApproval) {
      await JoinReq.create({ user: user._id, username, email, note: note||'' });
      return res.status(201).json({ pending: true, message: 'Account created. Waiting for admin approval.' });
    }

    await activity(user._id, username, 'signup');
    res.status(201).json({ token: sign(user._id), user: user.safe() });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

// POST /api/auth/login
router.post('/login', limiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.checkPassword(password))) return res.status(401).json({ message: 'Invalid credentials' });
    if (user.status === 'pending') return res.status(403).json({ message: 'Account pending admin approval', pending: true });
    if (user.status === 'banned') return res.status(403).json({ message: 'Account banned' });
    await User.findByIdAndUpdate(user._id, { isOnline: true });
    await activity(user._id, user.username, 'login', '', '', req.ip);
    res.json({ token: sign(user._id), user: user.safe() });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// POST /api/auth/logout
router.post('/logout', protect, async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { isOnline: false, lastSeen: new Date() });
  await activity(req.user._id, req.user.username, 'logout');
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => res.json({ user: req.user.safe ? req.user.safe() : req.user }));

// PATCH /api/auth/profile — username, password, bio, jobTitle, department (NOT email)
router.patch('/profile', protect, async (req, res) => {
  try {
    const { username, password, currentPassword, bio, jobTitle, department, presence } = req.body;
    const user = await User.findById(req.user._id);

    if (username && username !== user.username) {
      if (username.length < 3 || username.length > 30) return res.status(400).json({ message: 'Username 3-30 chars' });
      const taken = await User.findOne({ username, _id: { $ne: user._id } });
      if (taken) return res.status(409).json({ message: 'Username already taken' });
      user.username = username;
    }

    if (password) {
      if (!currentPassword) return res.status(400).json({ message: 'Current password required' });
      if (!(await user.checkPassword(currentPassword))) return res.status(401).json({ message: 'Wrong current password' });
      if (password.length < 8) return res.status(400).json({ message: 'New password min 8 chars' });
      user.password = password;
    }

    if (bio !== undefined) user.bio = bio;
    if (jobTitle !== undefined) user.jobTitle = jobTitle;
    if (department !== undefined) user.department = department;
    if (presence !== undefined) user.presence = presence;

    await user.save();
    await activity(user._id, user.username, 'profile_updated');
    res.json({ user: user.safe() });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;