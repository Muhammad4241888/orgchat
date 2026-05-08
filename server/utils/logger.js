// utils/logger.js
const { Log } = require('../models');
const activity = async (userId, username, action, details = '', room = '', ip = '') => {
  try { await Log.create({ userId, username, action, details, room, ip }); } catch {}
};
module.exports = { activity };