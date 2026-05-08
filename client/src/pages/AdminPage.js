import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { id: 'overview', icon: '📊', label: 'Overview' },
  { id: 'join-requests', icon: '🚪', label: 'Join Requests' },
  { id: 'room-requests', icon: '🔑', label: 'Room Requests' },
  { id: 'users', icon: '👥', label: 'Users' },
  { id: 'rooms', icon: '💬', label: 'Rooms' },
  { id: 'alerts', icon: '⚠️', label: 'Alerts' },
  { id: 'tasks', icon: '📋', label: 'Tasks' },
  { id: 'meetings', icon: '📅', label: 'Meetings' },
  { id: 'logs', icon: '📜', label: 'Logs' },
  { id: 'analytics', icon: '📈', label: 'Analytics' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
];

const LBL = {
  display: 'block',
  fontSize: 10,
  color: 'var(--text2)',
  marginBottom: 5,
  fontFamily: 'JetBrains Mono, monospace',
  letterSpacing: '.08em',
};

function Empty({ text }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
      {text}
    </div>
  );
}

function Badge({ children, color, bg, border }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color, background: bg, border }}>
      {children}
    </span>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [joinReqs, setJoinReqs] = useState([]);
  const [roomReqs, setRoomReqs] = useState([]);
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [logs, setLogs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [settingsData, setSettingsData] = useState({});
  const [settingsForm, setSettingsForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [domainInput, setDomainInput] = useState('');

  const [newRoom, setNewRoom] = useState({ name: '', displayName: '', description: '', icon: '💬', type: 'restricted' });
  const [newTask, setNewTask] = useState({ title: '', description: '', assignedTo: '', assignedToName: '', priority: 'medium', dueDate: '', room: 'general' });
  const [newMeeting, setNewMeeting] = useState({ title: '', description: '', startTime: '', endTime: '', link: '', attendees: [], attendeeNames: [] });

  useEffect(() => {
    if (!['admin', 'manager'].includes(user?.role)) nav('/chat');
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const isAdmin = user?.role === 'admin';
    // FIX: use allSettled so one failing request doesn't crash the whole dashboard.
    // Also guard adminOnly routes (logs, analytics, join-requests, settings)
    // so managers don't get 403s that break the page.
    try {
      const safe = (promise) => promise.catch(() => ({ data: null }));

      const [
        statsRes, joinRes, roomReqRes, usersRes, roomsRes,
        alertsRes, tasksRes, meetingsRes, logsRes, analyticsRes, settingsRes,
      ] = await Promise.all([
        safe(axios.get('/api/admin/stats')),
        isAdmin ? safe(axios.get('/api/admin/join-requests')) : Promise.resolve({ data: { requests: [] } }),
        safe(axios.get('/api/admin/room-requests')),
        safe(axios.get('/api/admin/users')),
        safe(axios.get('/api/admin/rooms')),
        safe(axios.get('/api/admin/alerts')),
        safe(axios.get('/api/admin/tasks')),
        safe(axios.get('/api/admin/meetings')),
        isAdmin ? safe(axios.get('/api/admin/logs'))      : Promise.resolve({ data: { logs: [] } }),
        isAdmin ? safe(axios.get('/api/admin/analytics')) : Promise.resolve({ data: null }),
        isAdmin ? safe(axios.get('/api/admin/settings'))  : Promise.resolve({ data: null }),
      ]);

      if (statsRes.data)     setStats(statsRes.data);
      if (joinRes.data)      setJoinReqs(joinRes.data.requests || []);
      if (roomReqRes.data)   setRoomReqs(roomReqRes.data.requests || []);
      if (usersRes.data)     setUsers(usersRes.data.users || []);
      if (roomsRes.data)     setRooms(roomsRes.data.rooms || []);
      if (alertsRes.data)    setAlerts(alertsRes.data.alerts || []);
      if (tasksRes.data)     setTasks(tasksRes.data.tasks || []);
      if (meetingsRes.data)  setMeetings(meetingsRes.data.meetings || []);
      if (logsRes.data)      setLogs(logsRes.data.logs || []);
      if (analyticsRes.data) setAnalytics(analyticsRes.data);
      if (settingsRes.data?.org) {
        setSettingsData(settingsRes.data.org);
        setSettingsForm(settingsRes.data.org);
      }
    } catch (e) { console.error('fetchAll error:', e); }
    finally { setLoading(false); }
  };

  const approveJoin = async (id, action) => { await axios.patch(`/api/admin/join-requests/${id}`, { action }); fetchAll(); };
  const approveRoom = async (id, action) => { await axios.patch(`/api/admin/room-requests/${id}`, { action }); fetchAll(); };

  const changeStatus = async (id, status) => {
    if (!window.confirm(`Set user to ${status}?`)) return;
    await axios.patch(`/api/admin/users/${id}/status`, { status });
    fetchAll();
  };

  const changeRole = async (id, role) => {
    await axios.patch(`/api/admin/users/${id}/role`, { role });
    fetchAll();
  };

  const toggleRoom = async (userId, currentRooms, room) => {
    const updated = currentRooms.includes(room)
      ? currentRooms.filter(r => r !== room)
      : [...currentRooms, room];
    await axios.patch(`/api/admin/users/${userId}/rooms`, { rooms: updated });
    fetchAll();
  };

  const handleAlert = async (id, action) => { await axios.patch(`/api/admin/alerts/${id}`, { action }); fetchAll(); };

  const createRoom = async () => {
    if (!newRoom.name || !newRoom.displayName) { alert('Name required'); return; }
    await axios.post('/api/admin/rooms', newRoom);
    setNewRoom({ name: '', displayName: '', description: '', icon: '💬', type: 'restricted' });
    fetchAll();
  };

  const archiveRoom = async (id) => {
    if (!window.confirm('Archive this room?')) return;
    await axios.delete(`/api/admin/rooms/${id}`);
    fetchAll();
  };

  const createTask = async () => {
    if (!newTask.title || !newTask.assignedTo) { alert('Title and assignee required'); return; }
    await axios.post('/api/admin/tasks', newTask);
    setNewTask({ title: '', description: '', assignedTo: '', assignedToName: '', priority: 'medium', dueDate: '', room: 'general' });
    fetchAll();
  };

  const createMeeting = async () => {
    if (!newMeeting.title || !newMeeting.startTime || !newMeeting.endTime) { alert('Title, start and end required'); return; }
    await axios.post('/api/admin/meetings', newMeeting);
    setNewMeeting({ title: '', description: '', startTime: '', endTime: '', link: '', attendees: [], attendeeNames: [] });
    fetchAll();
  };

  const saveSettings = async () => {
    await axios.patch('/api/admin/settings', settingsForm);
    alert('Settings saved!');
    fetchAll();
  };

  const addDomain = () => {
    if (!domainInput.trim()) return;
    const d = domainInput.trim().replace('@', '');
    const curr = settingsForm.allowedDomains || [];
    if (!curr.includes(d)) setSettingsForm(f => ({ ...f, allowedDomains: [...curr, d] }));
    setDomainInput('');
  };

  const removeDomain = (d) => setSettingsForm(f => ({ ...f, allowedDomains: (f.allowedDomains || []).filter(x => x !== d) }));

  const fmtDate = ts => ts ? new Date(ts).toLocaleString() : '—';
  const TC = { low: '#fbbf24', medium: '#f59e0b', high: '#ef4444' };

  const setNR = (k) => (e) => setNewRoom(f => ({ ...f, [k]: e.target.value }));
  const setNT = (k) => (e) => setNewTask(f => ({ ...f, [k]: e.target.value }));
  const setNM = (k) => (e) => setNewMeeting(f => ({ ...f, [k]: e.target.value }));
  const setSF = (k) => (e) => setSettingsForm(f => ({ ...f, [k]: e.target.value }));

  const renderContent = () => {
    if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text2)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>Loading...</div>;

    switch (tab) {

      // ── OVERVIEW ────────────────────────────────────────────────────────
      case 'overview': return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total Users', val: stats?.users, icon: '👥', color: 'var(--accent)' },
              { label: 'Active Users', val: stats?.active, icon: '✅', color: 'var(--green)' },
              { label: 'Online Now', val: stats?.online, icon: '🟢', color: 'var(--green)' },
              { label: 'Messages', val: stats?.msgs, icon: '💬', color: '#a78bfa' },
              { label: 'Unreviewed Alerts', val: stats?.unreviewed, icon: '⚠️', color: 'var(--red)' },
              { label: 'Pending Joins', val: stats?.joinPending, icon: '🚪', color: 'var(--orange)' },
              { label: 'Room Requests', val: stats?.roomPending, icon: '🔑', color: 'var(--yellow)' },
              { label: 'Open Tasks', val: stats?.tasks, icon: '📋', color: 'var(--accent)' },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: 'JetBrains Mono, monospace' }}>{s.val ?? '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {stats?.joinPending > 0 && (
            <div style={{ padding: '12px 16px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 8, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 18 }}>🚪</span>
              <span style={{ flex: 1, fontSize: 13 }}><strong>{stats.joinPending}</strong> user(s) waiting for approval</span>
              <button className="btn btn-warn btn-sm" onClick={() => setTab('join-requests')}>Review →</button>
            </div>
          )}
          {stats?.unreviewed > 0 && (
            <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <span style={{ flex: 1, fontSize: 13 }}><strong>{stats.unreviewed}</strong> unreviewed security alert(s)</span>
              <button className="btn btn-danger btn-sm" onClick={() => setTab('alerts')}>Review →</button>
            </div>
          )}
        </div>
      );

      // ── JOIN REQUESTS ────────────────────────────────────────────────────
      case 'join-requests': return (
        <div>
          <h3 style={{ marginBottom: 16, fontSize: 16 }}>🚪 Join Requests</h3>
          {joinReqs.length === 0 ? <Empty text="No pending join requests" /> : joinReqs.map(r => (
            <div key={r._id} className="card" style={{ padding: 16, marginBottom: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: 'var(--accent)', flexShrink: 0 }}>
                {r.username[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{r.username}</div>
                <div style={{ fontSize: 12, color: 'var(--text1)', fontFamily: 'JetBrains Mono, monospace', marginBottom: r.note ? 6 : 0 }}>{r.email}</div>
                {r.note && <div style={{ fontSize: 13, color: 'var(--text1)', padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6, fontStyle: 'italic' }}>"{r.note}"</div>}
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{fmtDate(r.createdAt)}</div>
              </div>
              {r.status === 'pending' ? (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-success btn-sm" onClick={() => approveJoin(r._id, 'approved')}>✓ Approve</button>
                  <button className="btn btn-danger btn-sm" onClick={() => approveJoin(r._id, 'rejected')}>✕ Reject</button>
                </div>
              ) : (
                <span style={{ color: r.status === 'approved' ? 'var(--green)' : 'var(--red)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, flexShrink: 0 }}>
                  ✓ {r.status.toUpperCase()}
                </span>
              )}
            </div>
          ))}
        </div>
      );

      // ── ROOM REQUESTS ────────────────────────────────────────────────────
      case 'room-requests': return (
        <div>
          <h3 style={{ marginBottom: 16, fontSize: 16 }}>🔑 Room Access Requests</h3>
          {roomReqs.length === 0 ? <Empty text="No pending room requests" /> : roomReqs.map(r => (
            <div key={r._id} className="card" style={{ padding: 16, marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>
                  {r.username} → <span style={{ color: 'var(--accent)' }}>#{r.roomDisplayName || r.room}</span>
                </div>
                {r.reason && <div style={{ fontSize: 13, color: 'var(--text1)', fontStyle: 'italic' }}>"{r.reason}"</div>}
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{fmtDate(r.createdAt)}</div>
              </div>
              {r.status === 'pending' ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-success btn-sm" onClick={() => approveRoom(r._id, 'approved')}>✓ Approve</button>
                  <button className="btn btn-danger btn-sm" onClick={() => approveRoom(r._id, 'rejected')}>✕ Reject</button>
                </div>
              ) : (
                <span style={{ color: r.status === 'approved' ? 'var(--green)' : 'var(--red)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                  ✓ {r.status.toUpperCase()}
                </span>
              )}
            </div>
          ))}
        </div>
      );

      // ── USERS ────────────────────────────────────────────────────────────
      case 'users': return (
        <div>
          <h3 style={{ marginBottom: 16, fontSize: 16 }}>👥 User Management</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg2)' }}>
                  {['User', 'Role', 'Status', 'Suspicion', 'Room Access', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--text2)', letterSpacing: '.08em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>
                          {u.username[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500 }}>{u.username}</div>
                          <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'JetBrains Mono, monospace' }}>{u.email}</div>
                          {u.jobTitle && <div style={{ fontSize: 10, color: 'var(--text2)' }}>{u.jobTitle}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {user.role === 'admin' ? (
                        <select
                          value={u.role}
                          onChange={e => changeRole(u._id, e.target.value)}
                          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text0)', padding: '3px 6px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                        >
                          <option value="user">User</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span style={{ color: u.role === 'admin' ? 'var(--accent)' : u.role === 'manager' ? '#a78bfa' : 'var(--text1)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                          {u.role.toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                        background: u.status === 'active' ? 'rgba(16,185,129,.15)' : u.status === 'banned' ? 'rgba(239,68,68,.15)' : 'rgba(245,158,11,.15)',
                        color: u.status === 'active' ? 'var(--green)' : u.status === 'banned' ? 'var(--red)' : 'var(--orange)',
                        border: u.status === 'active' ? '1px solid rgba(16,185,129,.3)' : u.status === 'banned' ? '1px solid rgba(239,68,68,.3)' : '1px solid rgba(245,158,11,.3)',
                      }}>
                        {u.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: u.suspicion > 20 ? 'var(--red)' : u.suspicion > 10 ? 'var(--orange)' : 'var(--green)' }}>
                      {u.suspicion}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {rooms.filter(r => r.type !== 'dm').map(r => {
                          const has = u.role === 'admin' || (u.roomAccess || []).includes(r.name);
                          return (
                            <button
                              key={r.name}
                              onClick={() => u.role !== 'admin' && toggleRoom(u._id, u.roomAccess || [], r.name)}
                              title={has ? 'Revoke access' : 'Grant access'}
                              style={{
                                padding: '2px 7px', fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                                borderRadius: 4, cursor: u.role === 'admin' ? 'default' : 'pointer',
                                background: has ? 'rgba(16,185,129,.1)' : 'rgba(255,255,255,.03)',
                                color: has ? 'var(--green)' : 'var(--text2)',
                                border: has ? '1px solid rgba(16,185,129,.3)' : '1px solid var(--border)',
                                transition: 'all .15s',
                              }}
                            >
                              #{r.name}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {u.role !== 'admin' && u._id !== user._id && (
                        <select
                          defaultValue=""
                          onChange={e => { if (e.target.value) changeStatus(u._id, e.target.value); }}
                          style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text0)', padding: '4px 8px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                        >
                          <option value="" disabled>Action</option>
                          <option value="active">Set Active</option>
                          <option value="banned">Ban User</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

      // ── ROOMS ────────────────────────────────────────────────────────────
      case 'rooms': return (
        <div>
          <h3 style={{ marginBottom: 16, fontSize: 16 }}>💬 Manage Rooms / Teams</h3>
          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>+ Create New Room</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={LBL}>ROOM SLUG (no spaces)</label>
                <input className="input" placeholder="e.g. marketing" value={newRoom.name} onChange={e => setNewRoom(f => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} />
              </div>
              <div>
                <label style={LBL}>DISPLAY NAME</label>
                <input className="input" placeholder="e.g. Marketing Team" value={newRoom.displayName} onChange={setNR('displayName')} />
              </div>
              <div>
                <label style={LBL}>DESCRIPTION</label>
                <input className="input" placeholder="What is this room for?" value={newRoom.description} onChange={setNR('description')} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={LBL}>ICON (emoji)</label>
                  <input className="input" placeholder="💬" value={newRoom.icon} onChange={setNR('icon')} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={LBL}>TYPE</label>
                  <select className="input" value={newRoom.type} onChange={setNR('type')}>
                    <option value="public">Public</option>
                    <option value="restricted">Restricted</option>
                    <option value="announcement">Announcement</option>
                  </select>
                </div>
              </div>
            </div>
            <button className="btn btn-primary" onClick={createRoom}>Create Room</button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {rooms.map(r => (
              <div key={r._id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>{r.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {r.displayName}
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--text2)', marginLeft: 6 }}>#{r.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text1)' }}>{r.description}</div>
                </div>
                <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, background: r.type === 'public' ? 'rgba(16,185,129,.15)' : 'rgba(0,212,255,.1)', color: r.type === 'public' ? 'var(--green)' : 'var(--accent)', border: r.type === 'public' ? '1px solid rgba(16,185,129,.3)' : '1px solid rgba(0,212,255,.2)' }}>
                  {r.type}
                </span>
                {!r.isDefault && <button className="btn btn-danger btn-sm" onClick={() => archiveRoom(r._id)}>Archive</button>}
                {r.isDefault && <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'JetBrains Mono, monospace' }}>DEFAULT</span>}
              </div>
            ))}
          </div>
        </div>
      );

      // ── ALERTS ───────────────────────────────────────────────────────────
      case 'alerts': return (
        <div>
          <h3 style={{ marginBottom: 16, fontSize: 16 }}>⚠️ Security Alerts</h3>
          {alerts.length === 0 ? <Empty text="No alerts — system clean ✓" /> : alerts.map(a => (
            <div key={a._id} className="card" style={{ padding: 16, marginBottom: 8, borderLeft: '3px solid ' + (TC[a.level] || 'var(--orange)'), display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: TC[a.level] || 'var(--orange)', marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{a.username}</span>
                  <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: TC[a.level], background: (TC[a.level] || '#888') + '22', border: '1px solid ' + (TC[a.level] || '#888') + '44' }}>
                    {(a.level || '').toUpperCase()}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'JetBrains Mono, monospace' }}>{(a.type || '').replace(/_/g, ' ')}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text1)', fontStyle: 'italic', marginBottom: 4 }}>"{a.content}"</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{a.details} · {fmtDate(a.createdAt)}</div>
              </div>
              {!a.reviewed ? (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleAlert(a._id, 'dismissed')}>Dismiss</button>
                  <button className="btn btn-warn btn-sm" onClick={() => handleAlert(a._id, 'warned')}>Warn</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleAlert(a._id, 'banned')}>Ban</button>
                </div>
              ) : (
                <span style={{ color: a.action === 'banned' ? 'var(--red)' : a.action === 'warned' ? 'var(--orange)' : 'var(--green)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, flexShrink: 0 }}>
                  ✓ {(a.action || '').toUpperCase()}
                </span>
              )}
            </div>
          ))}
        </div>
      );

      // ── TASKS ────────────────────────────────────────────────────────────
      case 'tasks': return (
        <div>
          <h3 style={{ marginBottom: 16, fontSize: 16 }}>📋 Task Assignment</h3>
          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>+ Assign New Task</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LBL}>TASK TITLE</label>
                <input className="input" placeholder="Task title..." value={newTask.title} onChange={setNT('title')} />
              </div>
              <div>
                <label style={LBL}>ASSIGN TO</label>
                <select className="input" value={newTask.assignedTo} onChange={e => {
                  const u = users.find(u => u._id === e.target.value);
                  setNewTask(f => ({ ...f, assignedTo: e.target.value, assignedToName: u?.username || '' }));
                }}>
                  <option value="">Select user...</option>
                  {users.filter(u => u.status === 'active').map(u => <option key={u._id} value={u._id}>{u.username}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>PRIORITY</label>
                <select className="input" value={newTask.priority} onChange={setNT('priority')}>
                  {['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>DUE DATE</label>
                <input className="input" type="date" value={newTask.dueDate} onChange={setNT('dueDate')} />
              </div>
              <div>
                <label style={LBL}>DESCRIPTION</label>
                <input className="input" placeholder="Optional details..." value={newTask.description} onChange={setNT('description')} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={createTask}>Assign Task</button>
          </div>
          {tasks.length === 0 ? <Empty text="No tasks created" /> : tasks.map(t => (
            <div key={t._id} className="card" style={{ padding: '12px 16px', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, marginBottom: 3 }}>{t.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text1)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>→ {t.assignedToName}</span>
                  <span>by {t.assignedByName}</span>
                  {t.dueDate && <span>Due: {new Date(t.dueDate).toLocaleDateString()}</span>}
                </div>
              </div>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: t.priority === 'urgent' ? 'rgba(239,68,68,.15)' : t.priority === 'high' ? 'rgba(245,158,11,.15)' : 'rgba(0,212,255,.1)', color: t.priority === 'urgent' ? 'var(--red)' : t.priority === 'high' ? 'var(--orange)' : 'var(--accent)', border: '1px solid rgba(0,0,0,.1)' }}>
                {t.priority}
              </span>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, background: 'var(--bg3)', color: t.status === 'completed' ? 'var(--green)' : t.status === 'in_progress' ? 'var(--accent)' : 'var(--text1)', border: '1px solid var(--border)' }}>
                {t.status.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      );

      // ── MEETINGS ─────────────────────────────────────────────────────────
      case 'meetings': return (
        <div>
          <h3 style={{ marginBottom: 16, fontSize: 16 }}>📅 Meeting Scheduler</h3>
          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>+ Schedule Meeting</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LBL}>TITLE</label>
                <input className="input" placeholder="Meeting title..." value={newMeeting.title} onChange={setNM('title')} />
              </div>
              <div>
                <label style={LBL}>START TIME</label>
                <input className="input" type="datetime-local" value={newMeeting.startTime} onChange={setNM('startTime')} />
              </div>
              <div>
                <label style={LBL}>END TIME</label>
                <input className="input" type="datetime-local" value={newMeeting.endTime} onChange={setNM('endTime')} />
              </div>
              <div>
                <label style={LBL}>MEETING LINK</label>
                <input className="input" placeholder="https://meet.google.com/..." value={newMeeting.link} onChange={setNM('link')} />
              </div>
              <div>
                <label style={LBL}>DESCRIPTION</label>
                <input className="input" placeholder="Agenda..." value={newMeeting.description} onChange={setNM('description')} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LBL}>ATTENDEES (hold Ctrl to select multiple)</label>
                <select multiple className="input" style={{ height: 90 }} onChange={e => {
                  const sel = [...e.target.selectedOptions];
                  setNewMeeting(f => ({ ...f, attendees: sel.map(o => o.value), attendeeNames: sel.map(o => o.text) }));
                }}>
                  {users.filter(u => u.status === 'active').map(u => <option key={u._id} value={u._id}>{u.username}</option>)}
                </select>
              </div>
            </div>
            <button className="btn btn-primary" onClick={createMeeting}>Schedule Meeting</button>
          </div>
          {meetings.length === 0 ? <Empty text="No meetings scheduled" /> : meetings.map(m => (
            <div key={m._id} className="card" style={{ padding: '12px 16px', marginBottom: 8 }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{m.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text1)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>🕐 {new Date(m.startTime).toLocaleString()}</span>
                <span>by {m.organizerName}</span>
                {m.link && <a href={m.link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Join →</a>}
              </div>
              {m.attendeeNames?.length > 0 && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>👥 {m.attendeeNames.join(', ')}</div>}
            </div>
          ))}
        </div>
      );

      // ── LOGS ─────────────────────────────────────────────────────────────
      case 'logs': return (
        <div>
          <h3 style={{ marginBottom: 16, fontSize: 16 }}>📜 Activity Logs</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg2)' }}>
                  {['Time', 'User', 'Action', 'Details', 'Room'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--text2)', letterSpacing: '.08em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={l._id || i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{new Date(l.timestamp).toLocaleString()}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--accent)' }}>{l.username}</td>
                    <td style={{ padding: '8px 12px' }}><span style={{ padding: '2px 8px', background: 'var(--bg3)', borderRadius: 4, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{l.action}</span></td>
                    <td style={{ padding: '8px 12px', color: 'var(--text1)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.details}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)', fontFamily: 'JetBrains Mono, monospace' }}>{l.room || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

      // ── ANALYTICS ────────────────────────────────────────────────────────
      case 'analytics': return (
        <div>
          <h3 style={{ marginBottom: 16, fontSize: 16 }}>📈 Usage Analytics (Last 30 Days)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Messages by Channel</div>
              {(analytics?.byRoom || []).map(r => {
                const max = Math.max(...(analytics?.byRoom || [{ count: 1 }]).map(x => x.count));
                return (
                  <div key={r._id} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                      <span>#{r._id}</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)' }}>{r.count}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 3, width: Math.min(100, (r.count / max) * 100) + '%' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Task Status</div>
              {(analytics?.taskStats || []).map(t => (
                <div key={t._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span>{(t._id || '').replace('_', ' ')}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', color: t._id === 'completed' ? 'var(--green)' : t._id === 'pending' ? 'var(--orange)' : 'var(--text1)' }}>{t.count}</span>
                </div>
              ))}
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6, fontSize: 13 }}>
                📁 Files sent: <strong style={{ color: 'var(--accent)' }}>{analytics?.fileCount || 0}</strong>
              </div>
            </div>
          </div>
        </div>
      );

      // ── SETTINGS ─────────────────────────────────────────────────────────
      case 'settings': return (
        <div>
          <h3 style={{ marginBottom: 20, fontSize: 16 }}>⚙️ Organization Settings</h3>
          <div style={{ display: 'grid', gap: 20, maxWidth: 700 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 14, color: 'var(--accent)' }}>🎨 Branding</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={LBL}>APP NAME</label>
                  <input className="input" value={settingsForm.appName || ''} onChange={setSF('appName')} />
                </div>
                <div>
                  <label style={LBL}>ORGANIZATION NAME</label>
                  <input className="input" value={settingsForm.orgName || ''} onChange={setSF('orgName')} />
                </div>
                <div>
                  <label style={LBL}>PRIMARY COLOR</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" value={settingsForm.primaryColor || '#00d4ff'} onChange={setSF('primaryColor')} style={{ width: 48, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'transparent' }} />
                    <span style={{ fontSize: 12, color: 'var(--text1)', fontFamily: 'JetBrains Mono, monospace' }}>{settingsForm.primaryColor}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 14, color: 'var(--accent)' }}>🔐 Security</div>
              <div style={{ marginBottom: 14 }}>
                <label style={LBL}>ALLOWED EMAIL DOMAINS</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input className="input" placeholder="giki.edu.pk" value={domainInput} onChange={e => setDomainInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDomain()} />
                  <button className="btn btn-primary" onClick={addDomain}>Add</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(settingsForm.allowedDomains || []).map(d => (
                    <span key={d} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'rgba(0,212,255,.1)', border: '1px solid rgba(0,212,255,.3)', borderRadius: 14, fontSize: 12, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
                      @{d}
                      <button onClick={() => removeDomain(d)} style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14, lineHeight: 1, marginLeft: 2 }}>×</button>
                    </span>
                  ))}
                  {(settingsForm.allowedDomains || []).length === 0 && <span style={{ fontSize: 12, color: 'var(--text2)' }}>No restrictions — all emails allowed</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <input type="checkbox" id="reqApproval" checked={settingsForm.requireApproval || false} onChange={e => setSettingsForm(f => ({ ...f, requireApproval: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="reqApproval" style={{ fontSize: 14, cursor: 'pointer' }}>Require admin approval for new signups</label>
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 14, color: 'var(--accent)' }}>📁 File Limits</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={LBL}>MAX FILE SIZE (MB)</label>
                  <input className="input" type="number" min="1" max="500" value={settingsForm.maxFileSizeMB || 50} onChange={e => setSettingsForm(f => ({ ...f, maxFileSizeMB: parseInt(e.target.value) }))} />
                </div>
                <div>
                  <label style={LBL}>MESSAGE RETENTION (days, 0=forever)</label>
                  <input className="input" type="number" min="0" value={settingsForm.retentionDays || 0} onChange={e => setSettingsForm(f => ({ ...f, retentionDays: parseInt(e.target.value) }))} />
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 14, color: 'var(--accent)' }}>🔗 Integrations</div>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={LBL}>GITHUB WEBHOOK URL</label>
                  <input className="input" placeholder="https://github.com/..." value={settingsForm.githubWebhook || ''} onChange={setSF('githubWebhook')} />
                </div>
                <div>
                  <label style={LBL}>JIRA WEBHOOK URL</label>
                  <input className="input" placeholder="https://yourcompany.atlassian.net/..." value={settingsForm.jiraWebhook || ''} onChange={setSF('jiraWebhook')} />
                </div>
              </div>
            </div>

            <button className="btn btn-primary" onClick={saveSettings} style={{ width: 160 }}>💾 Save Settings</button>
          </div>
        </div>
      );

      default: return null;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg0)' }}>
      <aside style={{ width: 220, background: 'var(--bg1)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '16px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 14, color: 'var(--accent)', letterSpacing: '.05em', marginBottom: 2 }}>SOC Dashboard</div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>{user?.username} · {user?.role}</div>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {TABS.filter(t => t.id !== 'settings' || user?.role === 'admin').map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', background: tab === t.id ? 'var(--bg3)' : 'transparent', border: 'none', borderLeft: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent', color: tab === t.id ? 'var(--text0)' : 'var(--text1)', cursor: 'pointer', fontSize: 13, textAlign: 'left', transition: 'all .1s' }}>
              <span style={{ fontSize: 15 }}>{t.icon}</span>
              {t.label}
              {t.id === 'join-requests' && stats?.joinPending > 0 && <span style={{ marginLeft: 'auto', background: 'var(--orange)', color: '#000', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{stats.joinPending}</span>}
              {t.id === 'alerts' && stats?.unreviewed > 0 && <span style={{ marginLeft: 'auto', background: 'var(--red)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{stats.unreviewed}</span>}
              {t.id === 'room-requests' && stats?.roomPending > 0 && <span style={{ marginLeft: 'auto', background: 'var(--yellow)', color: '#000', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{stats.roomPending}</span>}
            </button>
          ))}
        </nav>
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => nav('/chat')} style={{ flex: 1 }}>← Chat</button>
          <button className="btn btn-ghost btn-sm" onClick={fetchAll}>↺</button>
        </div>
      </aside>
      <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {renderContent()}
      </main>
    </div>
  );
}