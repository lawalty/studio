'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';

export default function AdminDashboardPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin Panel</CardTitle>
        <CardDescription>
          Admin functionality is temporarily disabled to diagnose a deployment issue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>Once the deployment is successful, the admin links will be restored.</p>
        <Link href="/" className="text-primary hover:underline mt-4 block">Go back home</Link>
      </CardContent>
    </Card>
  );
}
