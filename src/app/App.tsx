import { useState, useEffect } from 'react';
import { Login } from './components/Login';
import Dashboard from './components/Dashboard';
import { Toaster } from './components/ui/sonner';
import { getToken, isAuthenticated, logout, getUser } from '../utils/auth';

const AUTH_EXPIRED_EVENT = 'flightpoints:auth-expired';

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string>('');
  const [loginMessage, setLoginMessage] = useState('');

  useEffect(() => {
    // Clean up legacy localStorage keys on app load
    Object.keys(localStorage).forEach(key => {
      const legacyPrefixes = ['sb-', 'supa-'];
      if (key === 'localStore_73a3871f_v1' || legacyPrefixes.some(prefix => key.toLowerCase().includes(prefix))) {
        localStorage.removeItem(key);
      }
    });
    
    // Load user and token from localStorage
    const user = getUser();
    const token = getToken();
    
    if (user && token) {
      setCurrentUser(user);
      setAccessToken(token);
      setAuthed(true);
    }
    
    setLoading(false);
  }, []);

  useEffect(() => {
    const handleAuthExpired = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>;
      logout();
      setCurrentUser(null);
      setAccessToken('');
      setAuthed(false);
      setLoginMessage(customEvent.detail?.message || 'Please log in again.');
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired as EventListener);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired as EventListener);
    };
  }, []);

  const handleLogin = (accessToken: string, user: any) => {
    setAccessToken(accessToken);
    setCurrentUser(user);
    setAuthed(true);
    setLoginMessage('');
  };


  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    setAccessToken('');
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
        <Dashboard user={currentUser} accessToken={accessToken} onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} sessionMessage={loginMessage} />
      )}
      <Toaster />
    </>
  );
}