import { useState, useEffect } from 'react';
import Login from '../components/Login';
import Dashboard from './components/Dashboard';
import { Toaster } from './components/ui/sonner';
import { getToken, isAuthenticated, logout } from '../utils/auth';


export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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