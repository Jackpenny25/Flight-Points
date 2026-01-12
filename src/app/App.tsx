import { useState, useEffect } from 'react';
import supabase from '../utils/supabase/client';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Toaster } from './components/ui/sonner';


export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Session error:', error);
        setLoading(false);
        return;
      }

      if (session) {
        setAccessToken(session.access_token);
        setUser(session.user);
      }
    } catch (error) {
      console.error('Error checking session:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (token: string, userData: any) => {
    // Require a valid access token for logged-in users; guest cadet flow removed
    setAccessToken(token);
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      if (accessToken) {
        // only sign out from supabase if we actually have a session token
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('Error signing out:', err);
    } finally {
      setAccessToken(null);
      setUser(null);
    }
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
      {user && accessToken ? (
        <Dashboard user={user} accessToken={accessToken} onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
      <Toaster />
    </>
  );
}