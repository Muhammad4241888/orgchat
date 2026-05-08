import React from 'react';
import {BrowserRouter,Routes,Route,Navigate} from 'react-router-dom';
import {AuthProvider,useAuth} from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';

function Guard({children,admin}){
  const {user,loading}=useAuth();
  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#00d4ff',fontFamily:'JetBrains Mono,monospace',fontSize:13}}>Connecting...</div>;
  if(!user) return <Navigate to="/" replace/>;
  if(admin && user.role!=='admin') return <Navigate to="/chat" replace/>;
  return children;
}

export default function App(){
  return(
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AuthPage/>}/>
          <Route path="/chat" element={<Guard><ChatPage/></Guard>}/>
          <Route path="/admin" element={<Guard admin><AdminPage/></Guard>}/>
          <Route path="/profile" element={<Guard><ProfilePage/></Guard>}/>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}