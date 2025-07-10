
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { createPasskey } from '@/lib/passkey'; 
import { app } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Loader2, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function RegisterAdminPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!app) {
      toast({ title: "Configuration Error", description: "Firebase is not properly configured.", variant: "destructive" });
      setIsLoading(false);
      return;
    }
    const auth = getAuth(app);

    try {
      // Step 1: Create a standard Firebase user with email and password.
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      toast({ title: "User Created", description: "Successfully created user account. Now creating Passkey..." });

      // Step 2: Immediately create a passkey for this new user.
      await createPasskey();
      toast({ title: "Passkey Registered!", description: "You can now log in using your Passkey.", variant: "default" });

      router.push('/admin/login');

    } catch (error: any) {
      console.error("Registration error:", error);
      toast({
        title: 'Registration Failed',
        description: error.message || 'An unknown error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted">
      <Card className="w-full max-w-sm shadow-2xl">
        <form onSubmit={handleRegister}>
          <CardHeader className="text-center">
            <UserPlus className="mx-auto h-12 w-12 text-primary" />
            <CardTitle className="mt-4 text-2xl font-headline">Register Admin User</CardTitle>
            <CardDescription>
              Create the initial admin user and link a Passkey for secure sign-in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <Alert variant="default" className="bg-sky-50 border-sky-200">
                <KeyRound className="h-4 w-4 text-sky-700"/>
                <AlertTitle className="text-sky-800 font-bold">One-Time Setup</AlertTitle>
                <AlertDescription className="text-sky-700">
                This registration is a one-time process. After creating the user and passkey, you will use the secure Passkey login page.
                </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Choose a strong password"
                minLength={6}
              />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create User and Register Passkey
            </Button>
            <Button variant="link" asChild>
                <Link href="/admin/login">Already registered? Go to Login</Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
