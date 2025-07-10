
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, isSignInWithWebAuthn, signInWithPasskey } from 'firebase/auth';
import { app } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Fingerprint, Loader2, UserPlus } from 'lucide-react';
import Link from 'next/link';

export default function PasskeyLoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(true);
  const [isPasskeyAvailable, setIsPasskeyAvailable] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    async function checkAvailability() {
      if (!app) return;
      const auth = getAuth(app);
      try {
        const isAvailable = await isSignInWithWebAuthn(auth);
        setIsPasskeyAvailable(isAvailable);
      } catch (error) {
        console.error("Error checking passkey availability:", error);
        setIsPasskeyAvailable(false);
      } finally {
        setIsCheckingAvailability(false);
      }
    }
    checkAvailability();
  }, []);

  const handleLogin = async () => {
    setIsLoading(true);
    if (!app) {
      toast({ title: 'Firebase Error', description: 'Firebase is not configured.', variant: 'destructive' });
      setIsLoading(false);
      return;
    }
    const auth = getAuth(app);

    try {
      await signInWithPasskey(auth);
      router.push('/admin');
    } catch (error: any) {
      console.error("Passkey sign-in error:", error);
      toast({
        title: 'Login Failed',
        description: error.code === 'auth/cancelled-popup-request' ? 'Login process was cancelled.' : error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderContent = () => {
    if (isCheckingAvailability) {
      return (
        <div className="flex items-center justify-center space-x-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Checking Passkey compatibility...</span>
        </div>
      );
    }

    if (!isPasskeyAvailable) {
      return (
        <CardContent>
          <p className="text-destructive text-center">
            Your browser or device does not support Passkeys. Please try a different browser like Chrome or Safari on a device with a screen lock (fingerprint, face ID, PIN).
          </p>
        </CardContent>
      );
    }

    return (
      <>
        <CardContent>
          <p className="text-center text-muted-foreground">
            Sign in securely with your registered Passkey (e.g., fingerprint, face ID, or security key).
          </p>
        </CardContent>
        <CardFooter className="flex-col gap-4">
          <Button onClick={handleLogin} className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Fingerprint className="mr-2 h-4 w-4" />}
            Sign In With Passkey
          </Button>
          <Button variant="link" asChild>
            <Link href="/admin/register">
              <UserPlus className="mr-2 h-4 w-4" />
              First time? Register an admin user
            </Link>
          </Button>
        </CardFooter>
      </>
    );
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted">
      <Card className="w-full max-w-sm shadow-2xl">
        <CardHeader className="text-center">
          <Fingerprint className="mx-auto h-12 w-12 text-primary" />
          <CardTitle className="mt-4 text-2xl font-headline">Admin Login</CardTitle>
          <CardDescription>
            Secure Passkey Authentication
          </CardDescription>
        </CardHeader>
        {renderContent()}
      </Card>
    </div>
  );
}
