import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function ProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const nav = useNavigate();

  // Allow page to scroll (body has overflow:hidden for chat layout)
  useEffect(() => {
    document.body.classList.add('scrollable');
    return () => document.body.classList.remove('scrollable');
  }, []);

  const [form, setForm] = useState({
    username: user?.username || '',
    bio: user?.bio || '',
    jobTitle: user?.jobTitle || '',
    department: user?.department || '',
    phone: user?.phone || '',
    presence: user?.presence || 'available',
  });

  const [pwForm, setPwForm] = useState({
    currentPassword: '',
    password: '',
    confirmPassword: '',
  });

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setPw = k => e => setPwForm(f => ({ ...f, [k]: e.target.value }));

  const saveProfile = async e => {
    e.preventDefault();
    setMsg(''); setErr(''); setLoading(true);
    try {
      const r = await axios.patch('/api/auth/profile', {
        username: form.username,
        bio: form.bio,
        jobTitle: form.jobTitle,
        department: form.department,
        presence: form.presence,
      });
      updateUser(r.data.user);
      setMsg('Profile updated successfully!');
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to update profile');
    } finally { setLoading(false); }
  };

  const savePassword = async e => {
    e.preventDefault();
    setPwMsg(''); setPwErr('');
    if (pwForm.password !== pwForm.confirmPassword) {
      setPwErr('New passwords do not match'); return;
    }
    if (pwForm.password.length < 8) {
      setPwErr('Password must be at least 8 characters'); return;
    }
    setPwLoading(true);
    try {
      await axios.patch('/api/auth/profile', {
        currentPassword: pwForm.currentPassword,
        password: pwForm.password,
      });
      setPwMsg('Password changed successfully!');
      setPwForm({ currentPassword: '', password: '', confirmPassword: '' });
    } catch (e) {
      setPwErr(e.response?.data?.message || 'Failed to change password');
    } finally { setPwLoading(false); }
  };

  const PRESENCE = [
    { value: 'available', label: 'Available', color: 'var(--green)' },
    { value: 'busy', label: 'Busy', color: 'var(--red)' },
    { value: 'away', label: 'Away', color: 'var(--orange)' },
    { value: 'dnd', label: 'Do Not Disturb', color: '#6b7280' },
  ];

  const lbl = {
    display: 'block', fontSize: 11, color: 'var(--text2)',
    marginBottom: 5, fontFamily: 'JetBrains Mono,monospace', letterSpacing: '.08em'
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg0)', padding: 24 }}>
      {/* Header */}
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => nav('/chat')}>← Back to Chat</button>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>My Profile</h1>
        </div>

        {/* Avatar + info card */}
        <div className="card" style={{ padding: 24, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 70, height: 70, borderRadius: 14, background: 'rgba(0,212,255,.15)', border: '2px solid rgba(0,212,255,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>{user?.username}</div>
            <div style={{ fontSize: 13, color: 'var(--text1)', marginBottom: 4 }}>{user?.email}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className={`badge badge-${user?.role === 'admin' ? 'cyan' : user?.role === 'manager' ? 'purple' : 'green'}`}>
                {user?.role?.toUpperCase()}
              </span>
              {user?.jobTitle && <span className="badge badge-orange">{user.jobTitle}</span>}
              {user?.department && <span style={{ fontSize: 12, color: 'var(--text2)' }}>{user.department}</span>}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'JetBrains Mono,monospace' }}>
              Room Access: {(user?.roomAccess || []).length} channels
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {(user?.roomAccess || []).map(r => (
                <span key={r} style={{ fontSize: 10, padding: '2px 7px', background: 'rgba(0,212,255,.1)', border: '1px solid rgba(0,212,255,.3)', borderRadius: 10, color: 'var(--accent)', fontFamily: 'JetBrains Mono,monospace' }}>#{r}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Edit Profile */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 18, color: 'var(--accent)' }}>✏️ Edit Profile</div>
          <form onSubmit={saveProfile}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>USERNAME</label>
                <input className="input" value={form.username} onChange={set('username')} minLength={3} maxLength={30} required />
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>⚠ Email cannot be changed</div>
              </div>
              <div>
                <label style={lbl}>PRESENCE STATUS</label>
                <select className="input" value={form.presence} onChange={set('presence')}>
                  {PRESENCE.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>JOB TITLE</label>
                <input className="input" placeholder="e.g. Software Engineer" value={form.jobTitle} onChange={set('jobTitle')} />
              </div>
              <div>
                <label style={lbl}>DEPARTMENT</label>
                <input className="input" placeholder="e.g. Engineering" value={form.department} onChange={set('department')} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>BIO</label>
                <textarea className="input" placeholder="Tell your team about yourself..." value={form.bio} onChange={set('bio')} rows={3} maxLength={300} style={{ resize: 'none' }} />
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>{form.bio.length}/300</div>
              </div>
            </div>

            {msg && <div style={{ padding: '10px 12px', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 6, color: 'var(--green)', fontSize: 13, marginBottom: 12 }}>✓ {msg}</div>}
            {err && <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>⚠ {err}</div>}

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Saving...' : '💾 Save Profile'}
            </button>
          </form>
        </div>

        {/* Change Password */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 18, color: 'var(--accent)' }}>🔐 Change Password</div>
          <form onSubmit={savePassword}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 380, marginBottom: 14 }}>
              <div>
                <label style={lbl}>CURRENT PASSWORD</label>
                <input className="input" type="password" placeholder="Your current password" value={pwForm.currentPassword} onChange={setPw('currentPassword')} required />
              </div>
              <div>
                <label style={lbl}>NEW PASSWORD</label>
                <input className="input" type="password" placeholder="Min 8 characters" value={pwForm.password} onChange={setPw('password')} required />
              </div>
              <div>
                <label style={lbl}>CONFIRM NEW PASSWORD</label>
                <input className="input" type="password" placeholder="Repeat new password" value={pwForm.confirmPassword} onChange={setPw('confirmPassword')} required />
              </div>
            </div>

            {pwMsg && <div style={{ padding: '10px 12px', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 6, color: 'var(--green)', fontSize: 13, marginBottom: 12 }}>✓ {pwMsg}</div>}
            {pwErr && <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>⚠ {pwErr}</div>}

            <button className="btn btn-primary" type="submit" disabled={pwLoading}>
              {pwLoading ? 'Changing...' : '🔑 Change Password'}
            </button>
          </form>
        </div>

        {/* Danger zone */}
        <div className="card" style={{ padding: 24, border: '1px solid rgba(239,68,68,.2)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--red)' }}>⚠ Account</div>
          <p style={{ fontSize: 13, color: 'var(--text1)', marginBottom: 14 }}>Sign out from all devices and sessions.</p>
          <button className="btn btn-danger" onClick={() => { logout(); nav('/'); }}>
            ⏻ Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}