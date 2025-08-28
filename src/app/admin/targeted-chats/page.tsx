
'use client';

import React from 'react';
import AdminNav from '@/components/admin/AdminNav';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Crosshair, Construction } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

export default function TargetedChatsPage() {
  return (
    <div className="space-y-8">
      <AdminNav />
      <div>
        <h1 className="text-3xl font-bold font-headline text-primary flex items-center gap-3">
          <Crosshair className="h-8 w-8" />
          Targeted Chats
        </h1>
        <p className="text-muted-foreground mt-2">
          This area will allow you to create and manage specialized chat modes with unique configurations.
        </p>
      </div>

      <Alert>
        <Construction className="h-4 w-4" />
        <AlertTitle>Under Development</AlertTitle>
        <AlertDescription>
          The &quot;Targeted Chats&quot; feature is currently being planned. This page is a placeholder for where you will configure custom chat experiences that are separate from the three main, general-purpose chat modes.
        </AlertDescription>
      </Alert>
    </div>
  );
}
