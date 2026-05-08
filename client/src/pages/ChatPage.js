import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '✅', '👏'];
const PRESENCE_COLORS = { available: 'var(--green)', busy: 'var(--red)', away: 'var(--orange)', dnd: '#6b7280' };

export default function ChatPage() {
  const { user, token, logout, org } = useAuth();
  const nav = useNavigate();

  const [sock, setSock]               = useState(null);
  const [connected, setConnected]     = useState(false);
  const [rooms, setRooms]             = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [uploading, setUploading]     = useState(false);
  const [threatWarn, setThreatWarn]   = useState(null);
  const [adminAlert, setAdminAlert]   = useState(null);
  const [replyTo, setReplyTo]         = useState(null);
  const [showEmoji, setShowEmoji]     = useState(null);

  // DM state
  const [dmUser, setDmUser]           = useState(null);
  const [dmMessages, setDmMessages]   = useState({});
  const [currentDm, setCurrentDm]     = useState(null);

  // Search
  const [showSearch, setShowSearch]     = useState(false);
  const [searchQ, setSearchQ]           = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Room request modal
  const [showRoomReq, setShowRoomReq]   = useState(false);
  const [roomReqRoom, setRoomReqRoom]   = useState(null);
  const [roomReqReason, setRoomReqReason] = useState('');

  // Tasks & meetings modals
  const [showTasks, setShowTasks]       = useState(false);
  const [tasks, setTasks]               = useState([]);
  const [showMeetings, setShowMeetings] = useState(false);
  const [meetings, setMeetings]         = useState([]);

  // Image preview lightbox
  const [imagePreview, setImagePreview] = useState(null);

  // Presence selector
  const [showPresence, setShowPresence] = useState(false);

  const endRef      = useRef(null);
  const fileRef     = useRef(null);
  const typingTimer = useRef(null);
  const sockRef     = useRef(null);

  // ── Initial data fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return nav('/');
    axios.get('/api/admin/rooms').then(r => setRooms(r.data.rooms || [])).catch(() => {});
    axios.get('/api/admin/tasks').then(r => setTasks(r.data.tasks || [])).catch(() => {});
    axios.get('/api/admin/meetings').then(r => setMeetings(r.data.meetings || [])).catch(() => {});
  }, [token, nav]);

  // ── Socket setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    // FIX: avoid hardcoding localhost:5000 — derive from current hostname
    const socketUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

    const s = io(socketUrl, { auth: { token }, transports: ['websocket'] });

    s.on('connect', () => {
      setConnected(true);
      if (['admin', 'manager'].includes(user?.role)) s.emit('join_admin');
      // Auto-join general on first connect
      const gen = { name: 'general', displayName: 'General', icon: '📢', description: 'Company-wide announcements' };
      setCurrentRoom(gen);
      s.emit('join_room', 'general');
    });

    s.on('connect_error', () => setConnected(false));
    s.on('disconnect', () => setConnected(false));

    s.on('history',   msgs => setMessages(msgs));
    s.on('message',   msg  => setMessages(p => [...p, msg]));
    s.on('system',    msg  => setMessages(p => [...p, { ...msg, type: 'system', _id: Date.now() + Math.random() }]));
    s.on('users_update', users => setOnlineUsers(users));

    s.on('typing',      ({ username }) => setTypingUsers(p => [...new Set([...p, username])]));
    s.on('stop_typing', ({ username }) => setTypingUsers(p => p.filter(u => u !== username)));

    s.on('threat_warn', d => {
      setThreatWarn(d);
      setTimeout(() => setThreatWarn(null), 6000);
    });
    s.on('new_alert', d => {
      if (['admin', 'manager'].includes(user?.role)) {
        setAdminAlert(d);
        setTimeout(() => setAdminAlert(null), 8000);
      }
    });
    s.on('room_denied', ({ message }) =>
      setMessages(p => [...p, { type: 'system', text: `🔒 ${message}`, _id: Date.now() }])
    );

    s.on('message_deleted', ({ msgId }) =>
      setMessages(p => p.filter(m => m._id !== msgId))
    );
    s.on('message_edited', ({ msgId, content, editedAt }) =>
      setMessages(p => p.map(m => m._id === msgId ? { ...m, content, isEdited: true, editedAt } : m))
    );
    s.on('reaction', ({ msgId, reactions }) =>
      setMessages(p => p.map(m => m._id === msgId ? { ...m, reactions } : m))
    );
    s.on('read_receipt', ({ userId, msgIds }) =>
      setMessages(p => p.map(m => msgIds.includes(m._id) ? { ...m, readBy: [...(m.readBy || []), userId] } : m))
    );

    s.on('dm_history', ({ room, msgs }) =>
      setDmMessages(p => ({ ...p, [room]: msgs }))
    );
    s.on('dm_message', msg =>
      setDmMessages(p => ({ ...p, [msg.room]: [...(p[msg.room] || []), msg] }))
    );

    sockRef.current = s;
    setSock(s);
    return () => { s.disconnect(); };
  }, [token, user?.role]);

  // ── Auto scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, dmMessages, currentDm]);

  // ── Keyboard shortcut: Escape closes modals ──────────────────────────────────
  useEffect(() => {
    const handler = e => {
      if (e.key === 'Escape') {
        setShowSearch(false); setShowTasks(false); setShowMeetings(false);
        setShowRoomReq(false); setImagePreview(null); setShowPresence(false);
        setShowEmoji(null); setReplyTo(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const joinRoom = useCallback((room) => {
    if (!sockRef.current || (currentRoom?.name === room.name && !currentDm)) return;
    setCurrentRoom(room);
    setMessages([]);
    setTypingUsers([]);
    setCurrentDm(null);
    setDmUser(null);
    setReplyTo(null);
    sockRef.current.emit('join_room', room.name);
  }, [currentRoom, currentDm]);

  const openDM = useCallback((targetUser) => {
    if (!sockRef.current) return;
    setDmUser(targetUser);
    setCurrentRoom(null);
    setReplyTo(null);
    const ids = [user._id, targetUser.id || targetUser._id].map(String).sort();
    const dmRoom = `dm_${ids[0]}_${ids[1]}`;
    setCurrentDm(dmRoom);
    sockRef.current.emit('join_dm', targetUser.id || targetUser._id);
  }, [user]);

  const sendMessage = e => {
    e.preventDefault();
    if (!input.trim() || !sockRef.current) return;
    if (currentDm) {
      sockRef.current.emit('dm', { content: input.trim(), dmRoom: currentDm });
    } else if (currentRoom) {
      sockRef.current.emit('message', {
        content: input.trim(),
        room: currentRoom.name,
        replyTo: replyTo?._id || null,
      });
    }
    setInput('');
    setReplyTo(null);
    if (currentRoom) sockRef.current.emit('stop_typing', currentRoom.name);
  };

  const handleTyping = e => {
    setInput(e.target.value);
    if (currentRoom && sockRef.current) {
      sockRef.current.emit('typing', currentRoom.name);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(
        () => sockRef.current?.emit('stop_typing', currentRoom.name),
        1500
      );
    }
  };

  const handleFile = async e => {
    const file = e.target.files[0];
    if (!file || !currentRoom) return;
    fileRef.current.value = '';
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await axios.post('/api/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      sockRef.current?.emit('file_message', { ...r.data, room: currentRoom.name });
    } catch (err) {
      alert(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleReact = (msgId, emoji) => {
    sockRef.current?.emit('react', { msgId, emoji, room: currentRoom?.name });
    setShowEmoji(null);
  };

  const handleDelete = msgId => {
    if (!window.confirm('Delete this message?')) return;
    sockRef.current?.emit('delete_msg', { msgId, room: currentRoom?.name });
  };

  const handleEdit = (msg) => {
    const newContent = window.prompt('Edit message:', msg.content);
    if (newContent && newContent.trim() && newContent.trim() !== msg.content) {
      sockRef.current?.emit('edit', { msgId: msg._id, content: newContent.trim(), room: currentRoom?.name });
    }
  };

  const handlePin = async msgId => {
    try { await axios.patch(`/api/admin/messages/${msgId}/pin`); }
    catch { /* silently fail for non-managers */ }
  };

  const requestRoomAccess = async () => {
    try {
      await axios.post('/api/admin/room-requests', {
        room: roomReqRoom?.name,
        roomDisplayName: roomReqRoom?.displayName,
        reason: roomReqReason,
      });
      alert('Access request sent to admin!');
      setShowRoomReq(false);
      setRoomReqReason('');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to send request');
    }
  };

  const doSearch = async () => {
    if (searchQ.trim().length < 2) return;
    try {
      const r = await axios.get(`/api/admin/search?q=${encodeURIComponent(searchQ.trim())}`);
      setSearchResults(r.data.messages || []);
    } catch { setSearchResults([]); }
  };

  const changePresence = status => {
    sockRef.current?.emit('presence', status);
    setShowPresence(false);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDate = ts => new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const fmtSize = b =>
    b > 1e6 ? `${(b / 1e6).toFixed(1)} MB`
    : b > 1e3 ? `${(b / 1e3).toFixed(0)} KB`
    : `${b} B`;

  const myRooms    = rooms.filter(r => r.type !== 'dm' && (user?.role === 'admin' || (user?.roomAccess || []).includes(r.name)));
  const otherRooms = rooms.filter(r => r.type !== 'dm' && user?.role !== 'admin' && !(user?.roomAccess || []).includes(r.name));
  const myTasks    = tasks.filter(t => t.assignedTo === user?._id || t.assignedToName === user?.username);

  const activeMessages = currentDm ? (dmMessages[currentDm] || []) : messages;

  // ── Message renderer ────────────────────────────────────────────────────────
  const renderMsg = (msg, i) => {
    // System message (join/leave)
    if (msg.type === 'system') {
      return (
        <div key={msg._id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap' }}>
            {msg.text}
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
      );
    }

    const isOwn = msg.sender?.toString() === user?._id?.toString() || msg.senderName === user?.username;
    const canDelete = ['admin', 'manager'].includes(user?.role) || isOwn;
    const canEdit   = isOwn;
    const canPin    = ['admin', 'manager'].includes(user?.role);
    const threatColors = { low: '#fbbf24', medium: '#f59e0b', high: '#ef4444' };

    return (
      <div
        key={msg._id || i}
        className="fade-up"
        style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          marginBottom: 4,
          flexDirection: isOwn ? 'row-reverse' : 'row',
          padding: '3px 0',
        }}
      >
        {/* Avatar */}
        <div
          title={isOwn ? 'You' : `DM ${msg.senderName}`}
          onClick={() => {
            if (!isOwn) {
              const u = onlineUsers.find(u => u.username === msg.senderName);
              if (u) openDM(u);
            }
          }}
          style={{
            width: 36, height: 36, borderRadius: 9,
            background: isOwn ? 'rgba(0,212,255,.2)' : 'var(--bg3)',
            border: `1px solid ${isOwn ? 'rgba(0,212,255,.35)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 14,
            color: isOwn ? 'var(--accent)' : 'var(--text1)',
            flexShrink: 0, cursor: isOwn ? 'default' : 'pointer',
            userSelect: 'none',
          }}
        >
          {msg.senderName?.[0]?.toUpperCase() || '?'}
        </div>

        {/* Bubble column */}
        <div style={{ maxWidth: '70%', display: 'flex', flexDirection: 'column', gap: 3, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
          {/* Sender name + time (for others) */}
          {!isOwn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{msg.senderName}</span>
              {msg.senderRole === 'admin'   && <span className="badge badge-cyan"   style={{ fontSize: 9 }}>ADMIN</span>}
              {msg.senderRole === 'manager' && <span className="badge badge-purple" style={{ fontSize: 9 }}>MGR</span>}
              <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace' }}>
                {fmtTime(msg.timestamp)}
              </span>
            </div>
          )}

          {/* Reply preview */}
          {msg.replyPreview && (
            <div style={{
              fontSize: 12, color: 'var(--text2)', fontStyle: 'italic',
              borderLeft: '2px solid var(--accent)', paddingLeft: 8,
              maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              ↩ {msg.replyPreview}
            </div>
          )}

          {/* Bubble */}
          <div
            style={{
              position: 'relative',
              padding: (msg.type === 'image' || msg.type === 'video') ? 0 : '9px 13px',
              background: isOwn ? 'rgba(0,212,255,.12)' : 'var(--bg2)',
              borderRadius: isOwn ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
              border: `1px solid ${msg.isFlagged
                ? (threatColors[msg.threatLevel] || 'var(--orange)')
                : (isOwn ? 'rgba(0,212,255,.22)' : 'var(--border)')}`,
              fontSize: 14, lineHeight: 1.55, wordBreak: 'break-word', maxWidth: '100%',
            }}
          >
            {/* Threat badge */}
            {msg.isFlagged && (
              <div style={{
                position: 'absolute', top: -9, right: 8,
                fontSize: 9, color: '#fff',
                background: threatColors[msg.threatLevel] || 'var(--orange)',
                padding: '1px 6px', borderRadius: 4,
                fontFamily: 'JetBrains Mono,monospace',
              }}>
                ⚠ {msg.threatLevel}
              </div>
            )}

            {/* Content by type */}
            {msg.type === 'text' && (
              <span style={{ color: 'var(--text0)' }}>
                {msg.content}
                {msg.isEdited && (
                  <span style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 5 }}>(edited)</span>
                )}
              </span>
            )}

            {msg.type === 'image' && (
              <img
                src={msg.fileUrl} alt={msg.fileName}
                onClick={() => setImagePreview(msg.fileUrl)}
                style={{ maxWidth: 280, maxHeight: 220, borderRadius: 8, display: 'block', cursor: 'zoom-in' }}
              />
            )}

            {msg.type === 'video' && (
              <video controls style={{ maxWidth: 320, maxHeight: 220, borderRadius: 8, display: 'block' }}>
                <source src={msg.fileUrl} />
              </video>
            )}

            {msg.type === 'file' && (
              <a
                href={msg.fileUrl} target="_blank" rel="noreferrer" download
                style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text0)', textDecoration: 'none' }}
              >
                <span style={{ fontSize: 26 }}>📄</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{msg.fileName}</div>
                  <div style={{ fontSize: 10, color: 'var(--text2)' }}>{fmtSize(msg.fileSize || 0)}</div>
                </div>
              </a>
            )}

            {/* Action buttons (shown on hover via CSS class) */}
            <div
              className="msg-actions"
              style={{
                position: 'absolute', top: -30,
                [isOwn ? 'left' : 'right']: 0,
                display: 'flex', gap: 2,
                background: 'var(--bg1)', border: '1px solid var(--border)',
                borderRadius: 7, padding: '3px 5px', boxShadow: 'var(--shadow)',
                zIndex: 5,
              }}
            >
              <button className="btn-icon" title="React" onClick={() => setShowEmoji(showEmoji === msg._id ? null : msg._id)}>😊</button>
              <button className="btn-icon" title="Reply"  onClick={() => setReplyTo(msg)}>↩</button>
              {canEdit   && msg.type === 'text' && <button className="btn-icon" title="Edit"   onClick={() => handleEdit(msg)}>✏️</button>}
              {canDelete && <button className="btn-icon" title="Delete" onClick={() => handleDelete(msg._id)}>🗑</button>}
              {canPin    && <button className="btn-icon" title="Pin"    onClick={() => handlePin(msg._id)}>📌</button>}
            </div>

            {/* Emoji picker */}
            {showEmoji === msg._id && (
              <div style={{
                position: 'absolute', top: -58,
                [isOwn ? 'left' : 'right']: 0,
                display: 'flex', gap: 3,
                background: 'var(--bg1)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '7px 10px', zIndex: 20, boxShadow: 'var(--shadow)',
              }}>
                {EMOJIS.map(em => (
                  <button
                    key={em}
                    onClick={() => handleReact(msg._id, em)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, padding: 2, borderRadius: 5, transition: 'transform .1s' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.35)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reaction pills */}
          {msg.reactions && Object.keys(msg.reactions).length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {Object.entries(msg.reactions).map(([em, users]) =>
                Array.isArray(users) && users.length > 0 ? (
                  <button
                    key={em}
                    onClick={() => handleReact(msg._id, em)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
                      background: users.includes(user?._id?.toString()) ? 'rgba(0,212,255,.18)' : 'var(--bg3)',
                      border: `1px solid ${users.includes(user?._id?.toString()) ? 'rgba(0,212,255,.45)' : 'var(--border)'}`,
                      fontSize: 13,
                    }}
                  >
                    {em}
                    <span style={{ fontSize: 11, color: 'var(--text1)', fontFamily: 'JetBrains Mono,monospace' }}>{users.length}</span>
                  </button>
                ) : null
              )}
            </div>
          )}

          {/* Own message: timestamp + read receipt */}
          {isOwn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
              <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace' }}>
                {fmtTime(msg.timestamp)}
              </span>
              <span style={{ fontSize: 12, color: msg.readBy?.length > 0 ? 'var(--accent)' : 'var(--text2)' }}>
                {msg.readBy?.length > 0 ? '✓✓' : '✓'}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Derived values ───────────────────────────────────────────────────────────
  const headerTitle = currentDm
    ? `💬 ${dmUser?.username || 'Direct Message'}`
    : currentRoom
    ? `${currentRoom.icon || '#'} ${currentRoom.displayName}`
    : '…';

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg0)' }}>

      {/* ─── IMAGE LIGHTBOX ────────────────────────────────────────────────── */}
      {imagePreview && (
        <div
          onClick={() => setImagePreview(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, cursor: 'zoom-out',
          }}
        >
          <img
            src={imagePreview} alt="preview"
            style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,.7)' }}
          />
          <span style={{ position: 'absolute', top: 18, right: 24, fontSize: 28, color: '#fff', cursor: 'pointer' }}>✕</span>
        </div>
      )}

      {/* ─── ROOM ACCESS REQUEST MODAL ─────────────────────────────────────── */}
      {showRoomReq && roomReqRoom && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div className="card" style={{ padding: 28, width: 400 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>🔑 Request Access</div>
            <div style={{ fontSize: 13, color: 'var(--text1)', marginBottom: 16 }}>
              Channel: <strong style={{ color: 'var(--accent)' }}>#{roomReqRoom.displayName}</strong>
            </div>
            <label style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace', letterSpacing: '.08em', display: 'block', marginBottom: 6 }}>
              REASON (optional)
            </label>
            <textarea
              className="input" rows={3}
              placeholder="Why do you need access?"
              value={roomReqReason}
              onChange={e => setRoomReqReason(e.target.value)}
              style={{ resize: 'none', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={requestRoomAccess}>Send Request</button>
              <button className="btn btn-ghost"   onClick={() => { setShowRoomReq(false); setRoomReqReason(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SEARCH MODAL ──────────────────────────────────────────────────── */}
      {showSearch && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, paddingTop: 80 }}>
          <div className="card" style={{ padding: 24, width: 620, maxHeight: '72vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>🔍 Search Messages</div>
              <button className="btn-icon" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQ(''); }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                className="input" autoFocus
                placeholder="Search messages…"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doSearch()}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={doSearch}>Search</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {searchResults.length === 0 && searchQ.trim().length > 1 && (
                <div style={{ textAlign: 'center', color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace', fontSize: 12, padding: 30 }}>
                  No results found
                </div>
              )}
              {searchResults.map(m => (
                <div key={m._id} className="card" style={{ padding: '10px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)' }}>{m.senderName}</span>
                    <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace' }}>#{m.room}</span>
                    <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>{fmtDate(m.timestamp)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text1)' }}>{m.content}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── TASKS MODAL ───────────────────────────────────────────────────── */}
      {showTasks && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, paddingTop: 70 }}>
          <div className="card" style={{ padding: 24, width: 560, maxHeight: '78vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>📋 My Tasks</div>
              <button className="btn-icon" onClick={() => setShowTasks(false)}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {myTasks.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text2)', padding: 40, fontFamily: 'JetBrains Mono,monospace', fontSize: 12 }}>
                  No tasks assigned to you
                </div>
              )}
              {myTasks.map(t => {
                const prioColor = { urgent: 'var(--red)', high: 'var(--orange)', medium: 'var(--accent)', low: 'var(--text2)' };
                return (
                  <div key={t._id} className="card" style={{ padding: '13px 16px', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{t.title}</div>
                    {t.description && <div style={{ fontSize: 12, color: 'var(--text1)', marginBottom: 6 }}>{t.description}</div>}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: 'var(--bg3)', color: prioColor[t.priority] || 'var(--text1)', border: '1px solid var(--border)' }}>
                        {t.priority}
                      </span>
                      <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: 'var(--bg3)', color: t.status === 'completed' ? 'var(--green)' : 'var(--accent)', border: '1px solid var(--border)' }}>
                        {t.status.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>by {t.assignedByName}</span>
                      {t.dueDate && <span style={{ fontSize: 11, color: 'var(--text2)' }}>Due: {new Date(t.dueDate).toLocaleDateString()}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── MEETINGS MODAL ────────────────────────────────────────────────── */}
      {showMeetings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, paddingTop: 70 }}>
          <div className="card" style={{ padding: 24, width: 560, maxHeight: '78vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>📅 Upcoming Meetings</div>
              <button className="btn-icon" onClick={() => setShowMeetings(false)}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {meetings.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text2)', padding: 40, fontFamily: 'JetBrains Mono,monospace', fontSize: 12 }}>
                  No meetings scheduled
                </div>
              )}
              {meetings.map(m => (
                <div key={m._id} className="card" style={{ padding: '13px 16px', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{m.title}</div>
                  {m.description && <div style={{ fontSize: 12, color: 'var(--text1)', marginBottom: 6 }}>{m.description}</div>}
                  <div style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace', marginBottom: 4 }}>
                    🕐 {new Date(m.startTime).toLocaleString()} → {new Date(m.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>by {m.organizerName}</span>
                    {m.attendeeNames?.length > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text2)' }}>· {m.attendeeNames.join(', ')}</span>
                    )}
                    {m.link && (
                      <a href={m.link} target="_blank" rel="noreferrer"
                        style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                        🔗 Join →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── TOAST BANNERS ─────────────────────────────────────────────────── */}
      {threatWarn && (
        <div style={{
          position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)',
          zIndex: 500, background: '#ef4444', color: '#fff',
          padding: '11px 22px', borderRadius: 9,
          fontFamily: 'JetBrains Mono,monospace', fontSize: 13,
          boxShadow: '0 4px 24px rgba(239,68,68,.5)',
        }}>
          ⚠ Threat detected: {(threatWarn.type || '').replace(/_/g, ' ')} [{threatWarn.level}]
        </div>
      )}
      {adminAlert && (
        <div style={{
          position: 'fixed', top: 18, right: 20, zIndex: 500,
          background: '#ef4444', color: '#fff',
          padding: '11px 16px', borderRadius: 9, maxWidth: 320,
          fontFamily: 'JetBrains Mono,monospace', fontSize: 12,
          boxShadow: '0 4px 24px rgba(239,68,68,.5)',
        }}>
          🚨 Alert — <strong>{adminAlert.username}</strong>: {(adminAlert.type || '').replace(/_/g, ' ')} [{adminAlert.level}]
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SIDEBAR                                                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <aside style={{ width: 248, background: 'var(--bg1)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        {/* App header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🏢</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'JetBrains Mono,monospace', fontWeight: 700, fontSize: 13, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {org?.appName || 'OrgChat'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? 'var(--green)' : 'var(--text2)', boxShadow: connected ? '0 0 5px var(--green)' : 'none' }} />
              <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace' }}>
                {connected ? 'online' : 'connecting…'}
              </span>
            </div>
          </div>
        </div>

        {/* Channel + DM list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>

          {/* My channels */}
          <div style={{ padding: '8px 16px 4px', fontSize: 10, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace', letterSpacing: '.1em' }}>
            CHANNELS
          </div>
          {myRooms.map(r => {
            const active = !currentDm && currentRoom?.name === r.name;
            return (
              <button
                key={r.name}
                onClick={() => joinRoom(r)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  width: '100%', padding: '8px 16px',
                  background: active ? 'var(--bg3)' : 'transparent',
                  border: 'none',
                  borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                  color: active ? 'var(--text0)' : 'var(--text1)',
                  cursor: 'pointer', fontSize: 13, textAlign: 'left',
                  transition: 'background .1s',
                }}
              >
                <span style={{ fontSize: 15, flexShrink: 0 }}>{r.icon || '#'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.displayName}</span>
              </button>
            );
          })}

          {/* Locked channels — request access */}
          {otherRooms.length > 0 && (
            <>
              <div style={{ padding: '10px 16px 4px', fontSize: 10, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace', letterSpacing: '.1em' }}>
                REQUEST ACCESS
              </div>
              {otherRooms.map(r => (
                <button
                  key={r.name}
                  onClick={() => { setRoomReqRoom(r); setShowRoomReq(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', borderLeft: '2px solid transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}
                >
                  <span style={{ fontSize: 13 }}>🔒</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.displayName}</span>
                </button>
              ))}
            </>
          )}

          {/* Direct messages */}
          {onlineUsers.filter(u => u.username !== user?.username).length > 0 && (
            <>
              <div style={{ padding: '12px 16px 4px', fontSize: 10, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace', letterSpacing: '.1em' }}>
                DIRECT MESSAGES
              </div>
              {onlineUsers.filter(u => u.username !== user?.username).map(u => {
                const dmActive = currentDm && dmUser?.username === u.username;
                return (
                  <button
                    key={u.id || u._id}
                    onClick={() => openDM(u)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9,
                      width: '100%', padding: '7px 16px',
                      background: dmActive ? 'var(--bg3)' : 'transparent',
                      border: 'none',
                      borderLeft: dmActive ? '2px solid var(--accent)' : '2px solid transparent',
                      color: dmActive ? 'var(--text0)' : 'var(--text1)',
                      cursor: 'pointer', fontSize: 13, textAlign: 'left',
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: PRESENCE_COLORS[u.presence] || 'var(--green)', flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username}</span>
                    {u.role === 'admin'   && <span style={{ fontSize: 9, color: 'var(--accent)', fontFamily: 'JetBrains Mono,monospace' }}>ADM</span>}
                    {u.role === 'manager' && <span style={{ fontSize: 9, color: '#a78bfa', fontFamily: 'JetBrains Mono,monospace' }}>MGR</span>}
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Bottom: user info + quick nav */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px' }}>
          {/* Presence selector */}
          {showPresence && (
            <div className="card" style={{ marginBottom: 8, padding: 6 }}>
              {['available','busy','away','dnd'].map(s => (
                <button key={s} onClick={() => changePresence(s)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', background: 'transparent', border: 'none', color: 'var(--text1)', cursor: 'pointer', fontSize: 12, borderRadius: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: PRESENCE_COLORS[s] }} />
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <div
              onClick={() => setShowPresence(p => !p)}
              title="Change presence"
              style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,212,255,.15)', border: '1px solid rgba(0,212,255,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'var(--accent)', flexShrink: 0, cursor: 'pointer', position: 'relative' }}
            >
              {user?.username?.[0]?.toUpperCase()}
              <div style={{ position: 'absolute', bottom: -2, right: -2, width: 9, height: 9, borderRadius: '50%', background: PRESENCE_COLORS[user?.presence] || 'var(--green)', border: '2px solid var(--bg1)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.username}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace' }}>{user?.role}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => nav('/profile')} title="Profile" style={{ flex: 1, justifyContent: 'center' }}>👤</button>
            {['admin','manager'].includes(user?.role) && (
              <button className="btn btn-ghost btn-sm" onClick={() => nav('/admin')} title="Admin Panel" style={{ flex: 1, justifyContent: 'center' }}>⚙️</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => { logout(); nav('/'); }} title="Sign Out" style={{ flex: 1, justifyContent: 'center' }}>⏻</button>
          </div>
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MAIN CHAT AREA                                                       */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Top bar */}
        <div style={{ padding: '11px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg1)', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{headerTitle}</div>
            {currentRoom?.description && (
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{currentRoom.description}</div>
            )}
            {currentDm && dmUser && (
              <div style={{ fontSize: 11, color: PRESENCE_COLORS[dmUser.presence] || 'var(--green)', fontFamily: 'JetBrains Mono,monospace' }}>
                {dmUser.presence || 'available'}
              </div>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowTasks(true)}    title="My Tasks">📋</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowMeetings(true)} title="Meetings">📅</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSearch(true)}   title="Search">🔍</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {activeMessages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '70px 0', fontFamily: 'JetBrains Mono,monospace', fontSize: 12 }}>
              {currentDm
                ? `Start a conversation with ${dmUser?.username || 'this user'}`
                : `No messages in ${headerTitle} yet — say hello! 👋`}
            </div>
          )}
          {activeMessages.map((msg, i) => renderMsg(msg, i))}
          <div ref={endRef} />
        </div>

        {/* Typing indicator */}
        {typingUsers.length > 0 && !currentDm && (
          <div style={{ padding: '3px 20px 1px', fontSize: 11, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace', fontStyle: 'italic' }}>
            {typingUsers.slice(0, 3).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
          </div>
        )}

        {/* Reply preview bar */}
        {replyTo && (
          <div style={{ padding: '8px 20px', background: 'var(--bg2)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)', flexShrink: 0 }}>
              ↩ Replying to <strong style={{ color: 'var(--accent)' }}>{replyTo.senderName}</strong>:
            </span>
            <span style={{ fontSize: 12, color: 'var(--text1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {replyTo.content}
            </span>
            <button className="btn-icon" onClick={() => setReplyTo(null)} style={{ fontSize: 16, flexShrink: 0 }}>✕</button>
          </div>
        )}

        {/* Input bar */}
        <form
          onSubmit={sendMessage}
          style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg1)', flexShrink: 0 }}
        >
          <input
            type="file"
            ref={fileRef}
            onChange={handleFile}
            style={{ display: 'none' }}
            accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip,.csv,.xlsx"
          />
          <button
            type="button"
            className="btn-icon"
            title="Attach file"
            disabled={!currentRoom || uploading || currentDm != null}
            onClick={() => fileRef.current?.click()}
            style={{ fontSize: 20, flexShrink: 0 }}
          >
            {uploading ? '⏳' : '📎'}
          </button>
          <input
            className="input"
            value={input}
            onChange={handleTyping}
            placeholder={
              !connected         ? 'Connecting…'
              : currentDm        ? `Message ${dmUser?.username || 'user'}…`
              : currentRoom      ? `Message #${currentRoom.displayName}…`
              :                    'Select a channel…'
            }
            disabled={!connected}
            style={{ flex: 1 }}
            onKeyDown={e => {
              if (e.key === 'Escape') setReplyTo(null);
            }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!input.trim() || !connected}
            style={{ flexShrink: 0 }}
          >
            Send
          </button>
        </form>
      </main>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* RIGHT PANEL — Online users                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <aside style={{ width: 200, background: 'var(--bg1)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '13px 14px 8px', fontSize: 10, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace', letterSpacing: '.1em', borderBottom: '1px solid var(--border)' }}>
          ONLINE — {onlineUsers.length}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {onlineUsers.length === 0 && (
            <div style={{ padding: 20, fontSize: 11, color: 'var(--text2)', textAlign: 'center', fontFamily: 'JetBrains Mono,monospace' }}>
              No one online
            </div>
          )}
          {onlineUsers.map(u => (
            <div
              key={u.id || u._id}
              onClick={() => u.username !== user?.username && openDM(u)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '7px 12px',
                cursor: u.username !== user?.username ? 'pointer' : 'default',
                borderRadius: 6,
                transition: 'background .1s',
              }}
              onMouseEnter={e => { if (u.username !== user?.username) e.currentTarget.style.background = 'var(--bg3)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: 'var(--accent)', flexShrink: 0, position: 'relative' }}>
                {u.username?.[0]?.toUpperCase()}
                <div style={{ position: 'absolute', bottom: -2, right: -2, width: 9, height: 9, borderRadius: '50%', background: PRESENCE_COLORS[u.presence] || 'var(--green)', border: '2px solid var(--bg1)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username}</div>
                <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace' }}>{u.role}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>

    </div>
  );
}