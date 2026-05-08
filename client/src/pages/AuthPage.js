import React,{useState,useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../context/AuthContext';

export default function AuthPage(){
  const [mode,setMode]=useState('login');
  const [form,setForm]=useState({username:'',email:'',password:'',note:''});
  const [err,setErr]=useState('');
  const [info,setInfo]=useState('');
  const [loading,setLoading]=useState(false);
  const {login,signup,org}=useAuth();
  const nav=useNavigate();

  const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}));

  const submit=async e=>{
    e.preventDefault(); setErr(''); setInfo(''); setLoading(true);
    try{
      if(mode==='login'){
        await login(form.email,form.password);
        nav('/chat');
      } else {
        const r=await signup(form);
        if(r.data.pending){
          // Account created but needs admin approval — show message, stay on page
          setInfo(r.data.message);
        } else {
          // FIX: signup succeeded but token/user are not set yet in context.
          // We must call login so AuthContext sets the token and user state,
          // otherwise the Guard will redirect back to '/' immediately.
          await login(form.email, form.password);
          nav('/chat');
        }
      }
    }catch(e){
      const msg=e.response?.data?.message||'Something went wrong';
      if(e.response?.data?.pending) setInfo(msg);
      else setErr(msg);
    }finally{setLoading(false);}
  };

  const ac=org?.primaryColor||'#00d4ff';

  return(
    <div style={{minHeight:'100vh',background:'#0a0f1e',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:20,backgroundImage:'radial-gradient(ellipse at 20% 50%, rgba(0,212,255,0.05) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(124,58,237,0.05) 0%, transparent 60%)'}}>
      {/* Header */}
      <div style={{marginBottom:32,textAlign:'center'}}>
        <div style={{fontSize:40,marginBottom:8}}>🏢</div>
        <h1 style={{fontFamily:'JetBrains Mono,monospace',fontSize:26,fontWeight:700,color:ac,letterSpacing:'.1em',marginBottom:4}}>{org?.appName||'OrgChat'}</h1>
        <p style={{color:'#64748b',fontSize:13}}>{org?.orgName||'Organization Chat'}</p>
        {org?.allowedDomains?.length>0 && <p style={{color:'#475569',fontSize:11,marginTop:4,fontFamily:'JetBrains Mono,monospace'}}>Allowed: @{org.allowedDomains.join(', @')}</p>}
      </div>

      <div className="card" style={{width:'100%',maxWidth:400,overflow:'hidden'}}>
        {/* Tabs */}
        <div style={{display:'flex',borderBottom:'1px solid var(--border)'}}>
          {['login','signup'].map(m=>(
            <button key={m} onClick={()=>{setMode(m);setErr('');setInfo('');}} style={{flex:1,padding:'14px',background:'transparent',border:'none',borderBottom:mode===m?`2px solid ${ac}`:'2px solid transparent',color:mode===m?ac:'var(--text1)',fontWeight:600,fontSize:13,cursor:'pointer',letterSpacing:'.05em',textTransform:'uppercase',transition:'all .15s'}}>
              {m}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{padding:24,display:'flex',flexDirection:'column',gap:14}}>
          {mode==='signup'&&<div><label style={{display:'block',fontSize:11,color:'var(--text1)',marginBottom:5,fontFamily:'JetBrains Mono,monospace',letterSpacing:'.08em'}}>USERNAME</label><input className="input" placeholder="john_doe" value={form.username} onChange={set('username')} required/></div>}
          <div><label style={{display:'block',fontSize:11,color:'var(--text1)',marginBottom:5,fontFamily:'JetBrains Mono,monospace',letterSpacing:'.08em'}}>EMAIL</label><input className="input" type="email" placeholder={org?.allowedDomains?.length>0?`you@${org.allowedDomains[0]}`:'you@company.com'} value={form.email} onChange={set('email')} required/></div>
          <div><label style={{display:'block',fontSize:11,color:'var(--text1)',marginBottom:5,fontFamily:'JetBrains Mono,monospace',letterSpacing:'.08em'}}>PASSWORD</label><input className="input" type="password" placeholder={mode==='signup'?'Min 8 characters':'••••••••'} value={form.password} onChange={set('password')} required/></div>
          {mode==='signup'&&org?.requireApproval&&<div><label style={{display:'block',fontSize:11,color:'var(--text1)',marginBottom:5,fontFamily:'JetBrains Mono,monospace',letterSpacing:'.08em'}}>MESSAGE TO ADMIN (optional)</label><textarea className="input" placeholder="Why do you need access?" value={form.note} onChange={set('note')} rows={2} style={{resize:'none'}}/></div>}

          {err&&<div style={{padding:'10px 12px',background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:6,color:'#ef4444',fontSize:13}}>⚠ {err}</div>}
          {info&&<div style={{padding:'10px 12px',background:'rgba(16,185,129,.1)',border:'1px solid rgba(16,185,129,.3)',borderRadius:6,color:'#10b981',fontSize:13}}>✓ {info}</div>}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{width:'100%',justifyContent:'center',padding:'12px',marginTop:4,background:ac}}>
            {loading?'Please wait...':(mode==='login'?'Sign In':'Create Account')}
          </button>
        </form>
        {mode==='login'&&<p style={{textAlign:'center',padding:'0 24px 16px',fontSize:12,color:'var(--text2)',fontFamily:'JetBrains Mono,monospace'}}>First account = Admin</p>}
      </div>
    </div>
  );
}