
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bot, Database, KeyRound, Cog, BarChart2, Users, Clock, FileText, MessageCircle, AlertTriangle } from 'lucide-react';
import AdminNavLinkCard from '@/components/admin/AdminNavLinkCard';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert } from '../ui/alert';


const topTopicsData = [
  { topic: "General Inquiry", chats: 120 },
  { topic: "Product Help", chats: 98 },
  { topic: "Sales Question", chats: 75 },
  { topic: "Support", chats: 50 },
  { topic: "Feedback", chats: 32 },
];

const topDocumentsData = [
    { name: "Welcome_Guide.pdf", references: 89, lastAccessed: "1h ago" },
    { name: "FAQ_v2.pdf", references: 72, lastAccessed: "3h ago" },
    { name: "Company_Policy.docx", references: 45, lastAccessed: "2d ago" },
    { name: "Onboarding_Process.pdf", references: 31, lastAccessed: "5h ago" },
    { name: "Product_Catalog.pdf", references: 15, lastAccessed: "1w ago" },
];

export default function AdminDashboard() {
  const [realtimeUsers, setRealtimeUsers] = useState(0);

  useEffect(() => {
    // Simulate real-time user count fluctuations
    const initialUsers = Math.floor(Math.random() * 5);
    setRealtimeUsers(initialUsers);

    const interval = setInterval(() => {
      setRealtimeUsers(prev => {
        const change = Math.random() > 0.5 ? 1 : -1;
        const newCount = prev + change;
        return Math.max(0, newCount); // Ensure it doesn't go below 0
      });
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8">
      {/* Quick Nav Links */}
      <section>
         <h2 className="text-2xl font-semibold tracking-tight mb-4">Admin Controls</h2>
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <AdminNavLinkCard href="/admin/persona" title="AI Persona" description="Define conversational style and traits." Icon={Bot}/>
            <AdminNavLinkCard href="/admin/knowledge-base" title="Knowledge Base" description="Manage documents for the AI." Icon={Database}/>
            <AdminNavLinkCard href="/admin/api-keys" title="API Keys" description="Manage third-party service keys." Icon={KeyRound}/>
            <AdminNavLinkCard href="/admin/site-settings" title="Site Settings" description="Adjust splash screen and display." Icon={Cog}/>
         </div>
      </section>
      
      {/* Usage Statistics */}
      <section>
        <h2 className="text-2xl font-semibold tracking-tight mb-4">Usage Statistics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Real-time Users</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{realtimeUsers}</div>
                    <p className="text-xs text-muted-foreground">Users currently in a chat session</p>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Chats (Today)</CardTitle>
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">142</div>
                    <p className="text-xs text-muted-foreground">+15% from yesterday</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Chats (This Week)</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">893</div>
                    <p className="text-xs text-muted-foreground">+5.2% from last week</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Chats</CardTitle>
                    <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">25,304</div>
                    <p className="text-xs text-muted-foreground">Since project inception</p>
                </CardContent>
            </Card>
        </div>
      </section>

      {/* Topics and Documents */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><BarChart2 className="h-5 w-5" /> Top Topics</CardTitle>
                <CardDescription>Most frequently discussed topics in chat sessions.</CardDescription>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topTopicsData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <XAxis dataKey="topic" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                        <Tooltip
                          cursor={{fill: 'hsl(var(--muted))'}}
                          contentStyle={{
                            backgroundColor: 'hsl(var(--background))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: 'var(--radius)',
                          }}
                        />
                        <Bar dataKey="chats" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Top Documents</CardTitle>
                <CardDescription>Knowledge base files referenced most by the AI.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Document Name</TableHead>
                            <TableHead className="text-center">References</TableHead>
                            <TableHead className="text-right">Last Accessed</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {topDocumentsData.map((doc) => (
                        <TableRow key={doc.name}>
                            <TableCell className="font-medium truncate max-w-xs">{doc.name}</TableCell>
                            <TableCell className="text-center">{doc.references}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{doc.lastAccessed}</TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </section>
      
      {/* Placeholder for future feature */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <CardDescription>
            Note: The analytics data displayed on this dashboard is currently placeholder data for demonstration purposes.
        </CardDescription>
      </Alert>
    </div>
  );
}
