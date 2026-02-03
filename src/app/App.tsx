import { useState, useEffect, useRef } from 'react';
import supabase from '../utils/supabase/client';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Toaster } from './components/ui/sonner';


export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const logoutInProgress = useRef(false);

  useEffect(() => {
    // Check for existing session
    checkSession();
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (logoutInProgress.current) {
        setAccessToken(null);
        setUser(null);
        setLoading(false);
        return;
      }
      setAccessToken(session?.access_token ?? null);
      setUser(session?.user ?? null);
    });

    return () => {
      data.subscription.unsubscribe();
    };
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
    if (logoutInProgress.current) return;
    logoutInProgress.current = true;
    // Immediately clear UI state so the app responds instantly
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('adminPinVerified');
    }
    setAccessToken(null);
    setUser(null);
    setLoading(false);

    // Perform sign-out in the background with a short timeout
    const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      await Promise.race([
        supabase.auth.signOut(),
        timeout,
      ]);
    } catch (err) {
      console.error('Error signing out:', err);
      try {
        await Promise.race([
          supabase.auth.signOut({ scope: 'local' }),
          timeout,
        ]);
      } catch (fallbackErr) {
        console.error('Error signing out locally:', fallbackErr);
      }
    } finally {
      logoutInProgress.current = false;
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