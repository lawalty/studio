
'use client';

import React, { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { LogIn, AlertTriangle } from 'lucide-react';

const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const DEFAULT_ADMIN_PASSWORD_FOR_LOGIN_CHECK = "admin123"; // Fallback if Firestore is inaccessible

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      const docRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
      const docSnap = await getDoc(docRef);

      let correctPassword = DEFAULT_ADMIN_PASSWORD_FOR_LOGIN_CHECK;
      if (docSnap.exists() && docSnap.data()?.adminPassword) {
        correctPassword = docSnap.data()?.adminPassword;
      } else {
        // This case should ideally be rare if Site Settings initializes the password
        toast({
          title: "Password Not Configured",
          description: `Default password will be checked. Please set a password in Site Settings if this is the first login.`,
          variant: "default",
        });
      }

      if (password === correctPassword) {
        sessionStorage.setItem('isAdminAuthenticated', 'true');
        router.push('/admin');
      } else {
        toast({
          title: "Login Failed",
          description: "Incorrect password. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error during login:", error);
      toast({
        title: "Login Error",
        description: "Could not verify password. Please check console.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-headline">Admin Panel Access</CardTitle>
          <CardDescription>Enter the password to access the admin area.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter admin password"
              />
            </div>
            <Alert variant="default" className="bg-secondary/30 border-secondary">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <AlertTitle className="font-semibold text-sm">Security Notice</AlertTitle>
              <AlertDescription className="text-xs">
                This is a simple password gate. For production, ensure robust authentication mechanisms are in place.
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isLoading}>
              <LogIn className="mr-2 h-4 w-4" />
              {isLoading ? 'Verifying...' : 'Login'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
