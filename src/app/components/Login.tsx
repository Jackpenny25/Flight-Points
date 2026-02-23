// Role is no longer self-assigned during signup
import { useState } from 'react';
import { login } from '../../utils/auth';
import { api } from '../../utils/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';


interface LoginProps {
  onLogin: (accessToken: string, user: any) => void;
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
        displayError = `Invalid login credentials. Or your signup request hasn't yet been accepted — please wait or ask Sgt Penny J or your flight point giver.`;
      }
      setError(displayError);
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
      const result = await api.requestSignup({ email, password, name, joinCode, flight });
      if (result.error) {
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
          <Tabs defaultValue="signin" className="w-full" onValueChange={() => setError('')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email or Username</Label>
                  <Input
                    id="signin-email"
                    type="text"
                    placeholder="your.email@example.com or Surname I"
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
                  <Label htmlFor="signup-name">Username (First and Last Name)</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Format: "Surname Initial" (e.g., Smith J, Jones A). Admin may request changes if format is incorrect.
                  </p>
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
                {/* Role selection removed; Flight Point Leads will assign upon approval */}
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

        {/* Privacy Policy below the login card */}
        <div className="mt-6 text-center text-sm text-gray-600">
          <PrivacyPolicyModal />
          <div className="mt-2">By signing up, you agree to our Privacy Policy</div>
        </div>
      </div>
    </div>
  );
}
