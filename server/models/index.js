// models/index.js — All models in one place
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ── ORGANIZATION ──────────────────────────────────────────────────────────
const OrgSchema = new mongoose.Schema({
  appName:              { type: String, default: 'OrgChat' },
  orgName:              { type: String, default: 'My Organization' },
  primaryColor:         { type: String, default: '#00d4ff' },
  allowedDomains:       { type: [String], default: [] },
  requireApproval:      { type: Boolean, default: true },
  maxFileSizeMB:        { type: Number, default: 50 },
  retentionDays:        { type: Number, default: 0 },
  githubWebhook:        { type: String, default: '' },
  jiraWebhook:          { type: String, default: '' },
  updatedAt:            { type: Date, default: Date.now }
});
const Org = mongoose.model('Org', OrgSchema);

// ── USER ──────────────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:     { type: String, required: true, minlength: 8 },
  role:         { type: String, enum: ['user','manager','admin'], default: 'user' },
  status:       { type: String, enum: ['pending','active','banned'], default: 'pending' },
  jobTitle:     { type: String, default: '' },
  department:   { type: String, default: '' },
  bio:          { type: String, default: '', maxlength: 300 },
  avatar:       { type: String, default: '' },
  roomAccess:   { type: [String], default: [] },
  isOnline:     { type: Boolean, default: false },
  lastSeen:     { type: Date, default: Date.now },
  presence:     { type: String, enum: ['available','busy','away','dnd'], default: 'available' },
  suspicion:    { type: Number, default: 0 },
  flagCount:    { type: Number, default: 0 },
  createdAt:    { type: Date, default: Date.now }
});
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
UserSchema.methods.checkPassword = async function(p) { return bcrypt.compare(p, this.password); };
UserSchema.methods.safe = function() { const o = this.toObject(); delete o.password; return o; };
const User = mongoose.model('User', UserSchema);

// ── ROOM ──────────────────────────────────────────────────────────────────
const RoomSchema = new mongoose.Schema({
  name:         { type: String, required: true, unique: true },
  displayName:  { type: String, required: true },
  description:  { type: String, default: '' },
  icon:         { type: String, default: '💬' },
  type:         { type: String, enum: ['public','restricted','announcement','dm'], default: 'restricted' },
  isDefault:    { type: Boolean, default: false },
  isArchived:   { type: Boolean, default: false },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dmUsers:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  pinnedMsgs:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  createdAt:    { type: Date, default: Date.now }
});
const Room = mongoose.model('Room', RoomSchema);

// ── MESSAGE ───────────────────────────────────────────────────────────────
const MessageSchema = new mongoose.Schema({
  sender:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName:     { type: String, required: true },
  senderRole:     { type: String, default: 'user' },
  room:           { type: String, required: true },
  content:        { type: String, required: true, maxlength: 4000 },
  type:           { type: String, enum: ['text','image','video','file','system'], default: 'text' },
  fileUrl:        { type: String, default: null },
  fileName:       { type: String, default: null },
  fileSize:       { type: Number, default: null },
  fileMime:       { type: String, default: null },
  reactions:      { type: Map, of: [String], default: {} },
  readBy:         [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  replyTo:        { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  replyPreview:   { type: String, default: null },
  isPinned:       { type: Boolean, default: false },
  isEdited:       { type: Boolean, default: false },
  editedAt:       { type: Date, default: null },
  isFlagged:      { type: Boolean, default: false },
  threatLevel:    { type: String, enum: ['none','low','medium','high'], default: 'none' },
  threatType:     { type: String, default: null },
  isDeleted:      { type: Boolean, default: false },
  timestamp:      { type: Date, default: Date.now }
});
MessageSchema.index({ content: 'text', fileName: 'text' });
MessageSchema.index({ room: 1, timestamp: -1 });
const Message = mongoose.model('Message', MessageSchema);

// ── JOIN REQUEST ──────────────────────────────────────────────────────────
const JoinReqSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username:   { type: String, required: true },
  email:      { type: String, required: true },
  note:       { type: String, default: '' },
  status:     { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  createdAt:  { type: Date, default: Date.now }
});
const JoinReq = mongoose.model('JoinReq', JoinReqSchema);

// ── ROOM REQUEST ──────────────────────────────────────────────────────────
const RoomReqSchema = new mongoose.Schema({
  user:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username:        { type: String, required: true },
  room:            { type: String, required: true },
  roomDisplayName: { type: String, default: '' },
  reason:          { type: String, default: '' },
  status:          { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  reviewedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt:      { type: Date, default: null },
  createdAt:       { type: Date, default: Date.now }
});
const RoomReq = mongoose.model('RoomReq', RoomReqSchema);

// ── TASK ──────────────────────────────────────────────────────────────────
const TaskSchema = new mongoose.Schema({
  title:          { type: String, required: true, maxlength: 200 },
  description:    { type: String, default: '', maxlength: 1000 },
  assignedTo:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedToName: { type: String, required: true },
  assignedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedByName: { type: String, required: true },
  room:           { type: String, default: 'general' },
  status:         { type: String, enum: ['pending','in_progress','completed','cancelled'], default: 'pending' },
  priority:       { type: String, enum: ['low','medium','high','urgent'], default: 'medium' },
  dueDate:        { type: Date, default: null },
  completedAt:    { type: Date, default: null },
  createdAt:      { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', TaskSchema);

// ── MEETING ───────────────────────────────────────────────────────────────
const MeetingSchema = new mongoose.Schema({
  title:          { type: String, required: true, maxlength: 200 },
  description:    { type: String, default: '' },
  organizer:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizerName:  { type: String, required: true },
  attendees:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  attendeeNames:  [String],
  room:           { type: String, default: 'general' },
  startTime:      { type: Date, required: true },
  endTime:        { type: Date, required: true },
  link:           { type: String, default: '' },
  status:         { type: String, enum: ['scheduled','completed','cancelled'], default: 'scheduled' },
  createdAt:      { type: Date, default: Date.now }
});
const Meeting = mongoose.model('Meeting', MeetingSchema);

// ── ACTIVITY LOG ──────────────────────────────────────────────────────────
const LogSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username:   String,
  action:     String,
  details:    { type: String, default: '' },
  room:       { type: String, default: '' },
  ip:         { type: String, default: '' },
  timestamp:  { type: Date, default: Date.now }
});
const Log = mongoose.model('Log', LogSchema);

// ── ALERT ─────────────────────────────────────────────────────────────────
const AlertSchema = new mongoose.Schema({
  message:    { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username:   String,
  content:    String,
  level:      { type: String, enum: ['low','medium','high'] },
  type:       String,
  details:    String,
  reviewed:   { type: Boolean, default: false },
  action:     { type: String, enum: ['none','warned','banned','dismissed'], default: 'none' },
  createdAt:  { type: Date, default: Date.now }
});
const Alert = mongoose.model('Alert', AlertSchema);

module.exports = { Org, User, Room, Message, JoinReq, RoomReq, Task, Meeting, Log, Alert };