  // Role is no longer self-assigned during signup
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
);

interface LoginProps {
  onLogin: (accessToken: string | null, user: any) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [flight, setFlight] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        let displayError = error.message;
        if (error.message.includes('Invalid login credentials')) {
          displayError = `Invalid login credentials. Or your signup request hasn't yet been accepted — please wait or ask Sgt Penny J or your flight point giver.`;
        }
        setError(displayError);
        setLoading(false);
        return;
      }

      if (data.session) {
        onLogin(data.session.access_token, data.user);
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      setError('Failed to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      const functionBase = `https://${projectId}.supabase.co/functions/v1/server/make-server-73a3871f`;
      const response = await fetch(`${functionBase}/auth/request-signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ email, password, name, joinCode, flight }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Failed to submit signup request');
        setLoading(false);
        return;
      }
      setInfo('Signup request sent. Ask an Sgt Penny J or your point giver to approve your access');
      setName('');
      setEmail('');
      setPassword('');
    } catch (err: any) {
      console.error('Sign up error:', err);
      setError('Failed to sign up. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-100 via-blue-50 to-sky-200 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src="/logo.png" alt="2427 Biggin Hill Squadron" className="h-24 w-24 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-primary">2427 (Biggin Hill) Squadron</CardTitle>
            <CardDescription className="text-base">RAF Air Cadets - Flight Points Management</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full" onValueChange={() => setError('')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="your.email@example.com"
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
                {error && (
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing In...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="John Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-joincode">Join Code</Label>
                  <Input
                    id="signup-joincode"
                    type="text"
                    placeholder="Ask Sgt Penny J or point giver for the code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Flight</Label>
                  <Select value={flight} onValueChange={(v)=>setFlight(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your flight" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Flight</SelectItem>
                      <SelectItem value="2">2 Flight</SelectItem>
                      <SelectItem value="3">3 Flight</SelectItem>
                      <SelectItem value="4">4 Flight</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Role selection removed; SNCOs will assign upon approval */}
                {error && (
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                    {error}
                    <div className="mt-2 text-xs">
                      Please ask Sgt Penny J or your flight point giver for help.
                    </div>
                  </div>
                )}
                {info && (
                  <div className="text-sm text-green-700 bg-green-50 p-3 rounded">
                    {info}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Creating Account...' : 'Create Account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Allow guest cadet access without creating an account */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 text-center">
        <p className="text-sm text-gray-600 mb-2">Cadets can continue without creating an account — only SNCOs and Point Givers need accounts.</p>
        <div className="mt-2 flex items-center justify-center gap-3">
          <Input placeholder="Guest name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <Button
            variant="ghost"
            onClick={() => onLogin(null, { user_metadata: { role: 'cadet', name: name || 'Guest Cadet' } })}
          >
            Continue as Cadet (no account)
          </Button>
        </div>
      </div>
    </div>
  );
}
