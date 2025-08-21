
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bot, Database, KeyRound, Cog, BarChart2, Users, Clock, FileText, MessageCircle, AlertTriangle, ServerCrash, Download, Loader2, Trash2 } from 'lucide-react';
import AdminNavLinkCard from '@/components/admin/AdminNavLinkCard';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription as AlertDescriptionComponent, AlertTitle } from '../ui/alert';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, deleteDoc, orderBy, query, type Timestamp } from 'firebase/firestore';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getUsageStats, type UsageStats } from '@/ai/flows/get-usage-stats-flow';
import { getAppConfig } from '@/lib/app-config';

interface SiteError {
    id: string;
    message: string;
    source: string;
    timestamp: Date;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentModel, setCurrentModel] = useState('');
  const [siteErrors, setSiteErrors] = useState<SiteError[]>([]);
  const [isLoadingErrors, setIsLoadingErrors] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
        const [usageStats, appConfig] = await Promise.all([
            getUsageStats(),
            getAppConfig()
        ]);
        setStats(usageStats);
        setCurrentModel(appConfig.modelDisplayName);
    } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(); // Initial fetch

    const errorsQuery = query(collection(db, 'site_errors'), orderBy('timestamp', 'desc'));
    const unsubscribeErrors = onSnapshot(errorsQuery, (snapshot) => {
        const errorsData = snapshot.docs.map(doc => {
            const data = doc.data();
            const timestamp = data.timestamp;
            const date = timestamp && typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date();
            return {
                id: doc.id,
                message: data.message,
                source: data.source,
                timestamp: date,
            } as SiteError;
        });
        setSiteErrors(errorsData);
        setIsLoadingErrors(false);
    }, (error) => {
        console.error("Failed to fetch site errors:", error);
        setIsLoadingErrors(false);
    });

    return () => {
        unsubscribeErrors();
    };
  }, [fetchData]);

  const handleDeleteError = async (errorId: string) => {
      await deleteDoc(doc(db, 'site_errors', errorId));
  };
  
    const handleDownloadReport = () => {
        if (!stats) return;

        const reportContent = `
Usage Statistics Report
Generated on: ${new Date().toLocaleString()}

--- Current Model ---
${currentModel}

--- Totals ---
Total Chat Sessions: ${stats.totalChats}
Chats Today: ${stats.chatsToday}
Chats This Week: ${stats.chatsThisWeek}
Archived Chat Histories (KB): ${stats.chatHistoryCount}

--- Top Topics ---
${stats.topTopics.map(t => `${t.topic}: ${t.chats} chats`).join('\n')}

--- Top Documents Referenced ---
${stats.topDocuments.map(d => `${d.name}: ${d.references} references`).join('\n')}
        `;
        
        const blob = new Blob([reportContent.trim()], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `usage_stats_report_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

  return (
    <div className="space-y-8">
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold tracking-tight">Usage Statistics</h2>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadReport} disabled={!stats || isLoading}>
                    <Download className="mr-2 h-4 w-4" /> Download Report
                </Button>
            </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Current Model</CardTitle>
                    <Bot className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-xl font-bold">{isLoading ? <Loader2 className="h-6 w-6 animate-spin"/> : currentModel}</div>
                    <p className="text-xs text-muted-foreground">Active conversational model</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Archived Chats (KB)</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{isLoading ? <Loader2 className="h-6 w-6 animate-spin"/> : stats?.chatHistoryCount ?? 0}</div>
                    <p className="text-xs text-muted-foreground">Conversations in Chat History KB</p>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Chats (Today)</CardTitle>
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{isLoading ? <Loader2 className="h-6 w-6 animate-spin"/> : stats?.chatsToday ?? 0}</div>
                    <p className="text-xs text-muted-foreground">New conversations started</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Chats (This Week)</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{isLoading ? <Loader2 className="h-6 w-6 animate-spin"/> : stats?.chatsThisWeek ?? 0}</div>
                    <p className="text-xs text-muted-foreground">Past 7 days</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Chats</CardTitle>
                    <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{isLoading ? <Loader2 className="h-6 w-6 animate-spin"/> : stats?.totalChats ?? 0}</div>
                    <p className="text-xs text-muted-foreground">Since project inception</p>
                </CardContent>
            </Card>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><BarChart2 className="h-5 w-5" /> Top Topics</CardTitle>
                <CardDescription>Most frequently discussed topics in chat sessions.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? <div className="h-[300px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div> : (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={stats?.topTopics} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
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
                )}
            </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Top Documents</CardTitle>
                <CardDescription>Knowledge base files referenced most by the AI.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? <div className="h-[300px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div> : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Document Name</TableHead>
                                <TableHead className="text-center">References</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {stats?.topDocuments.map((doc) => (
                            <TableRow key={doc.name}>
                                <TableCell className="font-medium truncate max-w-xs">{doc.name}</TableCell>
                                <TableCell className="text-center">{doc.references}</TableCell>
                            </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
      </section>
      
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <CardDescription>
          Note: Top Documents & Top Topics analytics are currently placeholders. Other stats are live.
        </CardDescription>
      </Alert>
      
      <Accordion type="multiple" defaultValue={[]} className="w-full space-y-4">
        <AccordionItem value="admin-controls" className="border rounded-lg">
          <AccordionTrigger className="text-2xl font-semibold tracking-tight px-6 hover:no-underline">
            <span className="mr-4">Admin Controls</span>
            <span className="flex-grow border-b border-dashed border-muted-foreground/30"></span>
          </AccordionTrigger>
          <AccordionContent className="px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <AdminNavLinkCard href="/admin/persona" title="AI Persona" description="Define conversational style and traits." Icon={Bot}/>
              <AdminNavLinkCard href="/admin/knowledge-base" title="Knowledge Base" description="Manage documents for the AI." Icon={Database}/>
              <AdminNavLinkCard href="/admin/api-keys" title="API Keys" description="Manage third-party service keys." Icon={KeyRound}/>
              <AdminNavLinkCard href="/admin/site-settings" title="Site Settings" description="Adjust splash screen and display." Icon={Cog}/>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="error-board" className="border rounded-lg">
          <AccordionTrigger className="text-2xl font-semibold tracking-tight px-6 hover:no-underline">
             <span className="mr-4">Error Board ({isLoadingErrors ? '...' : siteErrors.length})</span>
             <span className="flex-grow border-b border-dashed border-muted-foreground/30"></span>
          </AccordionTrigger>
          <AccordionContent className="px-6 pt-2">
            <Card className="shadow-none border-none -m-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ServerCrash className="h-5 w-5" /> Recent System Errors</CardTitle>
                    <CardDescription>
                        Errors from public-facing interactions are logged here. Review and dismiss them as needed.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoadingErrors ? <p>Loading errors...</p> : siteErrors.length === 0 ? (
                        <Alert variant="default" className="border-green-500/50 text-green-700 dark:text-green-400">
                            <AlertTitle className="flex items-center gap-2"><Bot /> All Systems Operational</AlertTitle>
                            <AlertDescriptionComponent>No errors have been logged recently.</AlertDescriptionComponent>
                        </Alert>
                    ) : (
                        <ScrollArea className="h-72">
                            <div className="space-y-4 pr-4">
                                {siteErrors.map(error => (
                                    <Alert key={error.id} variant="destructive">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <AlertTitle>Error in: {error.source}</AlertTitle>
                                                <AlertDescriptionComponent className="break-words mt-1">{error.message}</AlertDescriptionComponent>
                                                <p className="text-xs text-destructive/80 mt-2">
                                                    {error.timestamp ? formatDistanceToNow(error.timestamp, { addSuffix: true }) : 'Just now'}
                                                </p>
                                            </div>
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteError(error.id)} className="h-6 w-6 ml-2 shrink-0">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </Alert>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
