// index.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const { verifySocket, protect } = require('./middleware/auth');
const { analyze } = require('./services/threats');
const { activity } = require('./utils/logger');
const { User, Org, Room, Message, Alert } = require('./models');

const app = express();
const server = http.createServer(app);

// Uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use('/uploads', express.static(uploadsDir));
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 500 }));

// Upload route
app.post('/api/upload', protect, async (req, res) => {
  const org = await Org.findOne();
  const maxMB = org?.maxFileSizeMB || 50;
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random()*1e9) + path.extname(file.originalname))
  });
  const upload = multer({
    storage,
    limits: { fileSize: maxMB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const blocked = ['.exe','.bat','.cmd','.scr','.vbs','.ps1'];
      if (blocked.includes(path.extname(file.originalname).toLowerCase())) return cb(new Error('File type blocked'));
      cb(null, true);
    }
  }).single('file');

  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({ message: `File too large. Max ${maxMB}MB allowed.` });
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: 'No file' });
    const fileType = req.file.mimetype.startsWith('image/') ? 'image' : req.file.mimetype.startsWith('video/') ? 'video' : 'file';
    const url = `http://localhost:${process.env.PORT||5000}/uploads/${req.file.filename}`;
    await activity(req.user._id, req.user.username, 'file_uploaded', req.file.originalname);
    res.json({ url, filename: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype, fileType });
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Socket.IO
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:3000', methods: ['GET','POST'] },
  maxHttpBufferSize: 1e7
});

io.use(async (socket, next) => {
  const decoded = verifySocket(socket.handshake.auth.token);
  if (!decoded) return next(new Error('Auth failed'));
  const user = await User.findById(decoded.id).select('-password');
  if (!user || user.status !== 'active') return next(new Error('Access denied'));
  socket.user = user;
  next();
});

const roomUsers = new Map();
const userSockets = new Map();

io.on('connection', async (socket) => {
  console.log(`✅ ${socket.user.username} connected`);
  await User.findByIdAndUpdate(socket.user._id, { isOnline: true });
  userSockets.set(socket.user._id.toString(), socket.id);

  // Join room
  socket.on('join_room', async (roomName) => {
    if (!roomName) return;
    const user = await User.findById(socket.user._id);
    const hasAccess = user.role === 'admin' || (user.roomAccess||[]).includes(roomName);
    if (!hasAccess) return socket.emit('room_denied', { room: roomName, message: `No access to #${roomName}. Request access from admin.` });

    // Leave old room
    if (socket.currentRoom && socket.currentRoom !== roomName) {
      socket.leave(socket.currentRoom);
      const ru = roomUsers.get(socket.currentRoom);
      if (ru) { ru.delete(socket.user._id.toString()); io.to(socket.currentRoom).emit('users_update', [...ru.values()]); }
    }

    socket.join(roomName);
    socket.currentRoom = roomName;
    if (!roomUsers.has(roomName)) roomUsers.set(roomName, new Map());
    roomUsers.get(roomName).set(socket.user._id.toString(), {
      id: socket.user._id, username: socket.user.username, role: socket.user.role, presence: socket.user.presence||'available'
    });
    io.to(roomName).emit('users_update', [...roomUsers.get(roomName).values()]);

    const msgs = await Message.find({ room: roomName, isDeleted: false }).sort({ timestamp: -1 }).limit(60).lean();
    socket.emit('history', msgs.reverse());
    io.to(roomName).emit('system', { text: `${socket.user.username} joined`, ts: new Date() });
    await activity(socket.user._id, socket.user.username, 'room_joined', '', roomName);
  });

  // Join DM
  socket.on('join_dm', async (otherId) => {
    const ids = [socket.user._id.toString(), otherId].sort();
    const dmRoom = `dm_${ids[0]}_${ids[1]}`;
    let room = await Room.findOne({ name: dmRoom });
    if (!room) room = await Room.create({ name: dmRoom, displayName: 'DM', type: 'dm', dmUsers: ids });
    socket.join(dmRoom);
    socket.currentDm = dmRoom;
    const msgs = await Message.find({ room: dmRoom, isDeleted: false }).sort({ timestamp: -1 }).limit(60).lean();
    socket.emit('dm_history', { room: dmRoom, msgs: msgs.reverse() });
  });

  // Text message
  socket.on('message', async ({ content, room, replyTo }) => {
    if (!content?.trim() || content.length > 4000) return;
    const clean = content.trim();
    const threat = analyze(clean);

    let replyPreview = null;
    if (replyTo) { const orig = await Message.findById(replyTo); if (orig) replyPreview = orig.content.slice(0,80); }

    const msg = await Message.create({
      sender: socket.user._id, senderName: socket.user.username, senderRole: socket.user.role,
      room, content: clean, type: 'text', replyTo: replyTo||null, replyPreview,
      isFlagged: threat.isThreat, threatLevel: threat.level, threatType: threat.type
    });

    if (threat.isThreat) {
      await Alert.create({ message: msg._id, user: socket.user._id, username: socket.user.username, content: clean, level: threat.level, type: threat.type, details: threat.details });
      await User.findByIdAndUpdate(socket.user._id, { $inc: { suspicion: 10, flagCount: 1 } });
      io.to('_admin').emit('new_alert', { username: socket.user.username, type: threat.type, level: threat.level, preview: clean.slice(0,80) });
      socket.emit('threat_warn', { type: threat.type, level: threat.level });
    }

    await activity(socket.user._id, socket.user.username, 'message_sent', '', room);
    io.to(room).emit('message', { _id: msg._id, sender: socket.user._id, senderName: socket.user.username, senderRole: socket.user.role, content: clean, type: 'text', room, isFlagged: threat.isThreat, threatLevel: threat.level, replyTo, replyPreview, reactions: {}, readBy: [], timestamp: msg.timestamp });
  });

  // DM message
  socket.on('dm', async ({ content, dmRoom }) => {
    if (!content?.trim()) return;
    const msg = await Message.create({ sender: socket.user._id, senderName: socket.user.username, room: dmRoom, content: content.trim(), type: 'text' });
    io.to(dmRoom).emit('dm_message', { _id: msg._id, sender: socket.user._id, senderName: socket.user.username, content: content.trim(), room: dmRoom, timestamp: msg.timestamp });
    await activity(socket.user._id, socket.user.username, 'dm_sent');
  });

  // File
  socket.on('file_message', async ({ url, filename, size, mimetype, fileType, room }) => {
    const msg = await Message.create({ sender: socket.user._id, senderName: socket.user.username, room, content: filename, type: fileType||'file', fileUrl: url, fileName: filename, fileSize: size, fileMime: mimetype });
    io.to(room).emit('message', { _id: msg._id, sender: socket.user._id, senderName: socket.user.username, content: filename, type: fileType||'file', fileUrl: url, fileName: filename, fileSize: size, room, isFlagged: false, timestamp: msg.timestamp });
  });

  // Reactions
  socket.on('react', async ({ msgId, emoji, room }) => {
    const msg = await Message.findById(msgId);
    if (!msg) return;
    const uid = socket.user._id.toString();
    const curr = msg.reactions.get(emoji)||[];
    msg.reactions.set(emoji, curr.includes(uid) ? curr.filter(x=>x!==uid) : [...curr, uid]);
    await msg.save();
    io.to(room).emit('reaction', { msgId, reactions: Object.fromEntries(msg.reactions) });
  });

  // Read receipts
  socket.on('read', async ({ msgIds, room }) => {
    if (!Array.isArray(msgIds)) return;
    await Message.updateMany({ _id: { $in: msgIds }, readBy: { $ne: socket.user._id } }, { $push: { readBy: socket.user._id } });
    socket.to(room).emit('read_receipt', { userId: socket.user._id, username: socket.user.username, msgIds });
  });

  // Edit
  socket.on('edit', async ({ msgId, content, room }) => {
    const msg = await Message.findById(msgId);
    if (!msg || msg.sender.toString() !== socket.user._id.toString()) return;
    msg.content = content.trim(); msg.isEdited = true; msg.editedAt = new Date();
    await msg.save();
    io.to(room).emit('message_edited', { msgId, content: msg.content, editedAt: msg.editedAt });
  });

  // Delete
  socket.on('delete_msg', async ({ msgId, room }) => {
    const msg = await Message.findById(msgId);
    if (!msg) return;
    const canDel = ['admin','manager'].includes(socket.user.role) || msg.sender.toString()===socket.user._id.toString();
    if (!canDel) return;
    await Message.findByIdAndUpdate(msgId, { isDeleted: true });
    io.to(room).emit('message_deleted', { msgId });
  });

  // Typing
  socket.on('typing', (room) => socket.to(room).emit('typing', { username: socket.user.username }));
  socket.on('stop_typing', (room) => socket.to(room).emit('stop_typing', { username: socket.user.username }));

  // Presence
  socket.on('presence', async (status) => {
    if (!['available','busy','away','dnd'].includes(status)) return;
    await User.findByIdAndUpdate(socket.user._id, { presence: status });
    if (socket.currentRoom && roomUsers.has(socket.currentRoom)) {
      const u = roomUsers.get(socket.currentRoom).get(socket.user._id.toString());
      if (u) u.presence = status;
      io.to(socket.currentRoom).emit('users_update', [...roomUsers.get(socket.currentRoom).values()]);
    }
  });

  // Admin room
  socket.on('join_admin', () => { if (['admin','manager'].includes(socket.user.role)) socket.join('_admin'); });

  socket.on('disconnect', async () => {
    console.log(`❌ ${socket.user.username} left`);
    await User.findByIdAndUpdate(socket.user._id, { isOnline: false, lastSeen: new Date() });
    userSockets.delete(socket.user._id.toString());
    const room = socket.currentRoom;
    if (room && roomUsers.has(room)) {
      roomUsers.get(room).delete(socket.user._id.toString());
      io.to(room).emit('users_update', [...roomUsers.get(room).values()]);
      io.to(room).emit('system', { text: `${socket.user.username} left`, ts: new Date() });
    }
  });
});

// Seed
async function seed() {
  const defaultRooms = [
    { name:'general', displayName:'General', description:'Company-wide', icon:'📢', type:'public', isDefault:true },
    { name:'tech', displayName:'Tech', description:'Technical discussions', icon:'💻', type:'restricted' },
    { name:'random', displayName:'Random', description:'Off-topic', icon:'🎲', type:'restricted' },
    { name:'cybersec', displayName:'Cyber Security', description:'Security team', icon:'🔐', type:'restricted' },
    { name:'hr', displayName:'HR', description:'Human resources', icon:'👥', type:'restricted' },
    { name:'marketing', displayName:'Marketing', description:'Marketing team', icon:'📣', type:'restricted' },
  ];
  for (const r of defaultRooms) await Room.findOneAndUpdate({ name: r.name }, r, { upsert: true });
  const orgCount = await Org.countDocuments();
  if (!orgCount) await Org.create({ appName: 'OrgChat', orgName: 'My Organization' });
  console.log('✅ Seeded');
}

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/orgchat')
  .then(async () => {
    console.log('✅ MongoDB connected');
    await seed();
    server.listen(PORT, () => {
      console.log(`🚀 OrgChat server on port ${PORT}`);
      console.log(`🔐 JWT: ${process.env.JWT_SECRET ? 'SET' : '⚠️  NOT SET'}`);
    });
  })
  .catch(err => { console.error('❌ DB error:', err.message); process.exit(1); });