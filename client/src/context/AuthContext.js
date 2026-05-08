import React,{createContext,useContext,useState,useEffect} from 'react';
import axios from 'axios';
const Ctx = createContext(null);
export function AuthProvider({children}){
  const [user,setUser]=useState(null);
  const [token,setToken]=useState(localStorage.getItem('oc_token'));
  const [loading,setLoading]=useState(true);
  const [org,setOrg]=useState({appName:'OrgChat',primaryColor:'#00d4ff'});

  useEffect(()=>{
    axios.get('/api/auth/org').then(r=>setOrg(r.data)).catch(()=>{});
    if(token){
      axios.defaults.headers.common['Authorization']=`Bearer ${token}`;
      axios.get('/api/auth/me').then(r=>setUser(r.data.user)).catch(()=>logout()).finally(()=>setLoading(false));
    } else setLoading(false);
  },[]);

  const login=async(email,password)=>{
    const r=await axios.post('/api/auth/login',{email,password});
    localStorage.setItem('oc_token',r.data.token);
    axios.defaults.headers.common['Authorization']=`Bearer ${r.data.token}`;
    setToken(r.data.token); setUser(r.data.user); return r.data.user;
  };
  const signup=async(data)=>axios.post('/api/auth/signup',data);
  const logout=()=>{
    localStorage.removeItem('oc_token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null); setUser(null);
  };
  const updateUser=(u)=>setUser(u);

  return <Ctx.Provider value={{user,token,org,loading,login,signup,logout,updateUser}}>{children}</Ctx.Provider>;
}
export const useAuth=()=>useContext(Ctx);