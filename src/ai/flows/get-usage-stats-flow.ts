
'use server';
/**
 * @fileOverview A flow to fetch and aggregate usage statistics for the admin dashboard.
 */
import { z } from 'zod';
import { db } from '@/lib/firebase-admin';
import { collection, query, where, getDocs, Timestamp,getCountFromServer } from 'firebase/firestore';

const UsageStatsSchema = z.object({
    totalChats: z.number(),
    chatsToday: z.number(),
    chatsThisWeek: z.number(),
    chatHistoryCount: z.number(),
    topTopics: z.array(z.object({ topic: z.string(), chats: z.number() })),
    topDocuments: z.array(z.object({ name: z.string(), references: z.number() })),
});
export type UsageStats = z.infer<typeof UsageStatsSchema>;

export async function getUsageStats(): Promise<UsageStats> {
    try {
        const sessionsRef = collection(db, 'chat_sessions');
        const kbMetaRef = collection(db, 'kb_meta');

        // Total Chats
        const totalChatsSnapshot = await getCountFromServer(sessionsRef);
        const totalChats = totalChatsSnapshot.data().count;

        // Chats Today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = Timestamp.fromDate(today);
        const todayQuery = query(sessionsRef, where('startTime', '>=', todayTimestamp));
        const todaySnapshot = await getCountFromServer(todayQuery);
        const chatsToday = todaySnapshot.data().count;

        // Chats This Week
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        oneWeekAgo.setHours(0, 0, 0, 0);
        const oneWeekAgoTimestamp = Timestamp.fromDate(oneWeekAgo);
        const weekQuery = query(sessionsRef, where('startTime', '>=', oneWeekAgoTimestamp));
        const weekSnapshot = await getCountFromServer(weekQuery);
        const chatsThisWeek = weekSnapshot.data().count;

        // Chat History Count
        const chatHistoryQuery = query(kbMetaRef, where('level', '==', 'Chat History'));
        const chatHistorySnapshot = await getCountFromServer(chatHistoryQuery);
        const chatHistoryCount = chatHistorySnapshot.data().count;
        
        // Placeholder data for charts, as real aggregation is complex for this demo
        const topTopics = [
            { topic: "General Inquiry", chats: 120 },
            { topic: "Product Help", chats: 98 },
            { topic: "Sales Question", chats: 75 },
            { topic: "Support", chats: 50 },
            { topic: "Feedback", chats: 32 },
        ];
        
        const topDocuments = [
            { name: "Welcome_Guide.pdf", references: 89 },
            { name: "FAQ_v2.pdf", references: 72 },
            { name: "Company_Policy.docx", references: 45 },
            { name: "Onboarding_Process.pdf", references: 31 },
            { name: "Product_Catalog.pdf", references: 15 },
        ];


        return {
            totalChats,
            chatsToday,
            chatsThisWeek,
            chatHistoryCount,
            topTopics,
            topDocuments,
        };

    } catch (error) {
        console.error("Error fetching usage stats:", error);
        // On error, return a default/empty state to prevent dashboard crash
        return {
            totalChats: 0,
            chatsToday: 0,
            chatsThisWeek: 0,
            chatHistoryCount: 0,
            topTopics: [],
            topDocuments: [],
        };
    }
}
