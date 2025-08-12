'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Smartphone, KeyRound, Loader2 } from 'lucide-react';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { app } from '@/lib/firebase';

export default function AdminLoginPage() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (recaptchaVerifierRef.current || !recaptchaContainerRef.current) {
        return;
    }
    
    try {
        const auth = getAuth(app);
        // Ensure the container is empty before initializing.
        if (recaptchaContainerRef.current.childElementCount === 0) {
          recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
              'size': 'invisible',
              'callback': () => {
                  // This callback is called when the reCAPTCHA is successfully verified.
              }
          });
        }
    } catch (error: any) {
        console.error("Error initializing reCAPTCHA:", error);
        toast({
            title: "reCAPTCHA Error",
            description: "Could not initialize the reCAPTCHA verifier. Please ensure the Phone sign-in provider is enabled in your Firebase console.",
            variant: "destructive"
        });
    }
  }, [toast]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!recaptchaVerifierRef.current) {
        toast({ title: 'Error', description: 'reCAPTCHA not ready. Please refresh the page and try again.', variant: 'destructive' });
        setIsLoading(false);
        return;
    }

    try {
      const auth = getAuth(app);
      const result = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifierRef.current);
      setConfirmationResult(result);
      toast({ title: 'Verification Code Sent', description: 'Please check your phone for the OTP (or use your test code).' });
    } catch (error: any) {
      console.error("Error sending OTP:", error);
      toast({
        title: 'Failed to Send Code',
        description: error.code === 'auth/invalid-phone-number' ? 'The phone number is not valid. Please include the country code (e.g., +1).' : 'An unknown error occurred. Please check the phone number and try again.',
        variant: 'destructive',
      });
    }
    setIsLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!confirmationResult) {
      toast({ title: 'Verification Error', description: 'Please request a verification code first.', variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    try {
      await confirmationResult.confirm(otp);
      toast({ title: 'Success!', description: 'You have been logged in successfully.' });
      router.push('/admin');
    } catch (error: any) {
      console.error("Error verifying OTP:", error);
      toast({
        title: 'Login Failed',
        description: 'The verification code is invalid. Please try again.',
        variant: 'destructive',
      });
    }
    setIsLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted">
      <Card className="w-full max-w-sm shadow-2xl">
        {!confirmationResult ? (
          <form onSubmit={handleSendOtp}>
            <CardHeader className="text-center">
              <Smartphone className="mx-auto h-12 w-12 text-primary" />
              <CardTitle className="mt-4 text-2xl font-headline">Admin Phone Sign-In</CardTitle>
              <CardDescription>
                Enter your phone number to receive a verification code.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                  placeholder="+1 555-555-1234"
                />
              </div>
            </CardContent>
            <CardFooter className="flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Verification Code
              </Button>
            </CardFooter>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <CardHeader className="text-center">
              <KeyRound className="mx-auto h-12 w-12 text-primary" />
              <CardTitle className="mt-4 text-2xl font-headline">Enter Code</CardTitle>
              <CardDescription>
                A code was sent to {phoneNumber}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp">Verification Code</Label>
                <Input
                  id="otp"
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  placeholder="123456"
                  autoComplete="one-time-code"
                />
              </div>
            </CardContent>
            <CardFooter className="flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
              <Button variant="link" size="sm" onClick={() => setConfirmationResult(null)}>
                Use a different phone number
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
      <div ref={recaptchaContainerRef} id="recaptcha-container"></div>
    </div>
  );
}
