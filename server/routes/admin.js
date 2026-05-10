// routes/admin.js
const router = require('express').Router();
const { protect, adminOnly, managerUp } = require('../middleware/auth');
const { activity } = require('../utils/logger');
const { User, Org, Room, Message, JoinReq, RoomReq, Task, Meeting, Log, Alert } = require('../models');
const { sendJoinAccepted, sendJoinRejected } = require('../services/email');

router.use(protect);

// ── STATS ─────────────────────────────────────────────────────────────────
router.get('/stats', managerUp, async (req, res) => {
  try {
    const [users, active, online, msgs, alerts, unreviewed, joinPending, roomPending, tasks] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ isOnline: true }),
      Message.countDocuments({ isDeleted: false }),
      Alert.countDocuments(),
      Alert.countDocuments({ reviewed: false }),
      JoinReq.countDocuments({ status: 'pending' }),
      RoomReq.countDocuments({ status: 'pending' }),
      Task.countDocuments({ status: { $ne: 'completed' } })
    ]);
    res.json({ users, active, online, msgs, alerts, unreviewed, joinPending, roomPending, tasks });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── ORGANIZATION SETTINGS ─────────────────────────────────────────────────
router.get('/settings', adminOnly, async (req, res) => {
  try {
    let org = await Org.findOne();
    if (!org) org = await Org.create({});
    res.json({ org });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.patch('/settings', adminOnly, async (req, res) => {
  try {
    let org = await Org.findOne();
    if (!org) org = new Org();
    const fields = ['appName','orgName','primaryColor','allowedDomains','requireApproval','maxFileSizeMB','retentionDays','githubWebhook','jiraWebhook'];
    fields.forEach(f => { if (req.body[f] !== undefined) org[f] = req.body[f]; });
    org.updatedAt = new Date();
    await org.save();
    await activity(req.user._id, req.user.username, 'settings_changed', 'Org settings updated');
    res.json({ org });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── JOIN REQUESTS ─────────────────────────────────────────────────────────
router.get('/join-requests', adminOnly, async (req, res) => {
  try {
    const reqs = await JoinReq.find({ status: req.query.status || 'pending' }).sort({ createdAt: -1 });
    res.json({ requests: reqs });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.patch('/join-requests/:id', adminOnly, async (req, res) => {
  try {
    const { action } = req.body; // 'approved' or 'rejected'
    const req2 = await JoinReq.findById(req.params.id);
    if (!req2) return res.status(404).json({ message: 'Not found' });
    req2.status = action; req2.reviewedBy = req.user._id; req2.reviewedAt = new Date();
    await req2.save();

    // Get org name for email
    const org = await Org.findOne();
    const appName = org?.appName || 'OrgChat';

    if (action === 'approved') {
      await User.findByIdAndUpdate(req2.user, { status: 'active', roomAccess: ['general'] });
      await activity(req.user._id, req.user.username, 'user_approved', `Approved ${req2.username}`);
      // Send acceptance email — non-blocking, won't crash if email fails
      sendJoinAccepted(req2.email, req2.username, appName);
    }

    if (action === 'rejected') {
      await activity(req.user._id, req.user.username, 'user_rejected', `Rejected ${req2.username}`);
      // Send rejection email — non-blocking
      sendJoinRejected(req2.email, req2.username, appName);
    }

    res.json({ request: req2 });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── ROOM REQUESTS ─────────────────────────────────────────────────────────
router.get('/room-requests', managerUp, async (req, res) => {
  try {
    const reqs = await RoomReq.find({ status: 'pending' }).sort({ createdAt: -1 });
    res.json({ requests: reqs });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.patch('/room-requests/:id', managerUp, async (req, res) => {
  try {
    const { action } = req.body;
    const req2 = await RoomReq.findById(req.params.id);
    if (!req2) return res.status(404).json({ message: 'Not found' });
    req2.status = action; req2.reviewedBy = req.user._id; req2.reviewedAt = new Date();
    await req2.save();
    if (action === 'approved') {
      const u = await User.findById(req2.user);
      if (u && !u.roomAccess.includes(req2.room)) { u.roomAccess.push(req2.room); await u.save(); }
    }
    res.json({ request: req2 });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── USERS ─────────────────────────────────────────────────────────────────
router.get('/users', managerUp, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ users });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.patch('/users/:id/status', adminOnly, async (req, res) => {
  try {
    const u = await User.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true }).select('-password');
    if (!u) return res.status(404).json({ message: 'Not found' });
    if (req.body.status === 'banned') await activity(req.user._id, req.user.username, 'user_banned', u.username);
    res.json({ user: u });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.patch('/users/:id/role', adminOnly, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user','manager','admin'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
    const u = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    res.json({ user: u });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.patch('/users/:id/rooms', managerUp, async (req, res) => {
  try {
    let { rooms } = req.body;
    if (!Array.isArray(rooms)) return res.status(400).json({ message: 'rooms must be array' });
    if (!rooms.includes('general')) rooms = ['general', ...rooms];
    const u = await User.findByIdAndUpdate(req.params.id, { roomAccess: rooms }, { new: true }).select('-password');
    res.json({ user: u });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/users/:id', adminOnly, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { status: 'banned' });
    res.json({ message: 'User removed' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── ROOMS ─────────────────────────────────────────────────────────────────
router.get('/rooms', protect, async (req, res) => {
  try {
    const rooms = await Room.find({ type: { $ne: 'dm' }, isArchived: false }).sort({ isDefault: -1, createdAt: 1 });
    res.json({ rooms });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.post('/rooms', managerUp, async (req, res) => {
  try {
    const { name, displayName, description, icon, type } = req.body;
    if (!name || !displayName) return res.status(400).json({ message: 'Name required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const exists = await Room.findOne({ name: slug });
    if (exists) return res.status(409).json({ message: 'Room already exists' });
    const room = await Room.create({ name: slug, displayName, description: description||'', icon: icon||'💬', type: type||'restricted', createdBy: req.user._id });
    await activity(req.user._id, req.user.username, 'room_created', displayName);
    res.status(201).json({ room });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.patch('/rooms/:id', managerUp, async (req, res) => {
  try {
    const room = await Room.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ room });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/rooms/:id', adminOnly, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (room?.isDefault) return res.status(400).json({ message: 'Cannot delete default room' });
    await Room.findByIdAndUpdate(req.params.id, { isArchived: true });
    res.json({ message: 'Room archived' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── ALERTS ────────────────────────────────────────────────────────────────
router.get('/alerts', managerUp, async (req, res) => {
  try {
    const filter = req.query.all === 'true' ? {} : { reviewed: false };
    const alerts = await Alert.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json({ alerts });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.patch('/alerts/:id', managerUp, async (req, res) => {
  try {
    const { action } = req.body;
    const alert = await Alert.findByIdAndUpdate(req.params.id, { reviewed: true, action }, { new: true });
    if (action === 'banned') await User.findByIdAndUpdate(alert.user, { status: 'banned' });
    res.json({ alert });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── TASKS ─────────────────────────────────────────────────────────────────
router.get('/tasks', protect, async (req, res) => {
  try {
    const filter = ['admin','manager'].includes(req.user.role) ? {} : { $or: [{ assignedTo: req.user._id }, { assignedBy: req.user._id }] };
    const tasks = await Task.find(filter).sort({ createdAt: -1 });
    res.json({ tasks });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.post('/tasks', managerUp, async (req, res) => {
  try {
    const { title, description, assignedTo, assignedToName, priority, dueDate, room } = req.body;
    if (!title || !assignedTo) return res.status(400).json({ message: 'Title and assignee required' });
    const task = await Task.create({ title, description, assignedTo, assignedToName, assignedBy: req.user._id, assignedByName: req.user.username, priority, dueDate, room });
    await activity(req.user._id, req.user.username, 'task_created', `Assigned to ${assignedToName}`);
    res.status(201).json({ task });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.patch('/tasks/:id', protect, async (req, res) => {
  try {
    const update = {};
    if (req.body.status) { update.status = req.body.status; if (req.body.status === 'completed') update.completedAt = new Date(); }
    if (req.body.priority) update.priority = req.body.priority;
    if (req.body.dueDate !== undefined) update.dueDate = req.body.dueDate;
    const task = await Task.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json({ task });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── MEETINGS ──────────────────────────────────────────────────────────────
router.get('/meetings', protect, async (req, res) => {
  try {
    const meetings = await Meeting.find({ $or: [{ organizer: req.user._id }, { attendees: req.user._id }] }).sort({ startTime: 1 });
    res.json({ meetings });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.post('/meetings', managerUp, async (req, res) => {
  try {
    const { title, description, attendees, attendeeNames, startTime, endTime, link, room } = req.body;
    if (!title || !startTime || !endTime) return res.status(400).json({ message: 'Title, start, end required' });
    const meeting = await Meeting.create({ title, description, organizer: req.user._id, organizerName: req.user.username, attendees, attendeeNames, startTime, endTime, link, room });
    await activity(req.user._id, req.user.username, 'meeting_created', title);
    res.status(201).json({ meeting });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── LOGS ──────────────────────────────────────────────────────────────────
router.get('/logs', adminOnly, async (req, res) => {
  try {
    const filter = {};
    if (req.query.username) filter.username = new RegExp(req.query.username, 'i');
    if (req.query.action) filter.action = req.query.action;
    const logs = await Log.find(filter).sort({ timestamp: -1 }).limit(200);
    res.json({ logs });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── ANALYTICS ─────────────────────────────────────────────────────────────
router.get('/analytics', adminOnly, async (req, res) => {
  try {
    const since = new Date(Date.now() - 30*24*60*60*1000);
    const [byRoom, fileCount, taskStats, dailyMsgs] = await Promise.all([
      Message.aggregate([{ $match: { timestamp: { $gte: since }, isDeleted: false } }, { $group: { _id: '$room', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Message.countDocuments({ type: { $in: ['image','video','file'] }, timestamp: { $gte: since } }),
      Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Message.aggregate([{ $match: { timestamp: { $gte: since } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }])
    ]);
    res.json({ byRoom, fileCount, taskStats, dailyMsgs });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── SEARCH ────────────────────────────────────────────────────────────────
router.get('/search', protect, async (req, res) => {
  try {
    const { q, type, room, from, to } = req.query;
    if (!q || q.length < 2) return res.status(400).json({ message: 'Query too short' });
    const filter = { isDeleted: false, $text: { $search: q } };
    if (req.user.role !== 'admin') filter.room = { $in: [...req.user.roomAccess] };
    if (room) filter.room = room;
    if (type) filter.type = type;
    if (from || to) { filter.timestamp = {}; if (from) filter.timestamp.$gte = new Date(from); if (to) filter.timestamp.$lte = new Date(to); }
    const messages = await Message.find(filter).sort({ timestamp: -1 }).limit(50);
    res.json({ messages });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── PIN MESSAGE ───────────────────────────────────────────────────────────
router.patch('/messages/:id/pin', managerUp, async (req, res) => {
  try {
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ message: 'Not found' });
    msg.isPinned = !msg.isPinned;
    await msg.save();
    res.json({ message: msg });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.delete('/messages/:id', managerUp, async (req, res) => {
  try {
    await Message.findByIdAndUpdate(req.params.id, { isDeleted: true });
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── ROOM REQUEST FROM USER ────────────────────────────────────────────────
router.post('/room-requests', protect, async (req, res) => {
  try {
    const { room, roomDisplayName, reason } = req.body;
    if (!room) return res.status(400).json({ message: 'Room required' });
    if (req.user.roomAccess.includes(room)) return res.status(400).json({ message: 'Already have access' });
    const exists = await RoomReq.findOne({ user: req.user._id, room, status: 'pending' });
    if (exists) return res.status(400).json({ message: 'Request already pending' });
    const req2 = await RoomReq.create({ user: req.user._id, username: req.user.username, room, roomDisplayName, reason });
    res.status(201).json({ request: req2 });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

router.get('/my-room-requests', protect, async (req, res) => {
  try {
    const reqs = await RoomReq.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ requests: reqs });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;