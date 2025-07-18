'use client';

import AdminDashboard from '@/components/admin/AdminDashboard';

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold font-headline tracking-tight text-primary">
          Admin Dashboard
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Welcome! Here is an overview of your AI application&apos;s activity.
        </p>
      </div>

      <AdminDashboard />
    </div>
  );
}
