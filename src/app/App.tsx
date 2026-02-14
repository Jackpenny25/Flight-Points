import { useState, useEffect } from 'react';
<<<<<<< HEAD
import Login from '../../components/Login';
=======
import { Login } from './components/Login';
>>>>>>> bc206a3ead2384a07e8c1b608c6d43ec57fd1321
import Dashboard from './components/Dashboard';
import { Toaster } from './components/ui/sonner';
import { getToken, isAuthenticated, logout } from '../utils/auth';


export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Clean up legacy localStorage keys on app load
    Object.keys(localStorage).forEach(key => {
      if (key === 'localStore_73a3871f_v1' || key.toLowerCase().includes('supabase')) {
        localStorage.removeItem(key);
      }
    });
    setAuthed(isAuthenticated());
    setLoading(false);
  }, []);

  const handleLogin = () => {
    setAuthed(true);
  };


  const handleLogout = () => {
    logout();
    setAuthed(false);
  };


  if (loading) {
    return (
      <div className="size-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <>
      {authed ? (
        <Dashboard onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
      <Toaster />
    </>
  );
}