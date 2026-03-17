// Accounts are admin-created; login only
import { useState } from 'react';
import { login } from '../../utils/auth';
import { api } from '../../utils/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';


interface LoginProps {
  onLogin: (accessToken: string, user: any) => void;
  sessionMessage?: string;
}

export function Login({ onLogin, sessionMessage }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Allow signing in with email OR username. If a username is provided, resolve it to an email using the server function.
      let loginEmail = String(email || '').trim();
      if (!loginEmail.includes('@')) {
        const lookup = await api.lookupEmail(loginEmail);
        if (lookup.error) {
          setError(lookup.error || 'Username not found');
          setLoading(false);
          return;
        }
        loginEmail = lookup.email;
      }

      const user = await login(loginEmail, password);
      const token = localStorage.getItem('token');
      
      if (token && user) {
        onLogin(token, user);
      } else {
        setError('Login failed - no token received');
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      let displayError = err.message || 'Failed to sign in. Please try again.';
      if (displayError.includes('Login failed')) {
        displayError = `Invalid login credentials. Please check your username and password, or ask your Flight Point Lead for your account details.`;
      }
      setError(displayError);
    } finally {
      setLoading(false);
    }
  };

  

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-100 via-blue-50 to-sky-200 p-8">
      <div className="w-full max-w-2xl px-4">
        <Card className="w-full max-w-lg md:max-w-xl mx-auto shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div>
            <CardTitle className="text-3xl font-bold text-primary">Flight Points</CardTitle>
            <CardDescription className="text-base">Flight Points Management</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signin-email">Username</Label>
              <Input
                id="signin-email"
                type="text"
                placeholder="your.username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signin-password">Password</Label>
              <Input
                id="signin-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {sessionMessage && (
              <div className="text-sm text-amber-900 bg-amber-100 border border-amber-300 p-3 rounded">
                {sessionMessage}
              </div>
            )}
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing In...' : 'Sign In'}
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-2">
              Need an account? Ask your Flight Point Lead or your flight point giver.
            </p>
          </form>
        </CardContent>
        </Card>

        {/* Privacy Policy below the login card */}
        <div className="mt-6 text-center text-sm text-gray-600">
          <PrivacyPolicyModal />
          <div className="mt-2">By signing in, you agree to our Privacy Policy</div>
        </div>
      </div>
    </div>
  );
}
