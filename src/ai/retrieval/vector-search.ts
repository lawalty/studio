/**
 * @fileOverview Performs a vector-based semantic search using Firestore's
 * native vector search capabilities.
 */
import { admin } from '@/lib/firebase-admin';
import { ai } from '@/ai/genkit'; 
import { preprocessText } from '@/ai/retrieval/preprocessing';

export interface SearchResult {
  sourceId: string;
  text: string;
  sourceName: string;
  level:string;
  topic:string;
  downloadURL?: string;
  distance: number;
  pageNumber?: number;
  title?: string;
  header?: string;
}

interface SearchParams {
  query: string;
  limit?: number;
  distanceThreshold: number; 
}
const firestore = admin.firestore();
let t='';  

export async function searchKnowledgeBase({
  query,
  limit = 10,
  distanceThreshold,
}: SearchParams): Promise<SearchResult[]> {

  const results: SearchResult[] = [];

  const processedQuery = preprocessText(query);
  if (!processedQuery) {
    return []; // Return empty if query is empty after processing
  }
  
  const embeddingResponse = await ai.embed({
    embedder: 'googleai/text-embedding-004',
    content: processedQuery
  });

  const queryEmbedding = embeddingResponse?.[0]?.embedding;
  if (!queryEmbedding || queryEmbedding.length !== 768) {
    throw new Error(`Failed to generate a valid 768-dimension embedding for the query.`);
  }
  let kb_meta_documentsIds:any=[];
  await firestore.collection('kb_meta').get()
    .then(kb_meta_collections => {
      kb_meta_documentsIds=kb_meta_collections.docs.map(doc => doc.id);
    });

    for(let i=0;i<kb_meta_documentsIds.length;i++)
    {
      await firestore.collection('kb_meta').doc(kb_meta_documentsIds[i]).collection('kb_chunks').get()
      .then(querySnapshot => {          
        querySnapshot.docs.forEach(documentSnapshot => {
            t+=documentSnapshot.id+"  ";
            let distance = 0;
            let sumOfSquares = 0;  
            for (let i = 0; i < queryEmbedding.length; i++) {
              sumOfSquares += Math.pow(documentSnapshot.get('embedding')[i] - queryEmbedding[i], 2);
            }
            distance=Math.sqrt(sumOfSquares)
          
            if(distance<=distanceThreshold)
            {
              results.push({
                distance:distance,
                sourceId: documentSnapshot.get('sourceId'),
                text: documentSnapshot.get('text'),
                sourceName: documentSnapshot.get('sourceName'),
                level: documentSnapshot.get('level'),
                topic: documentSnapshot.get('topic'),
                downloadURL: documentSnapshot.get('downloadURL'),
                pageNumber: documentSnapshot.get('pageNumber'),
                title: documentSnapshot.get('title'),
                header: documentSnapshot.get('header'),
              });
            }  
          });
      })  
    }
  return results.slice().sort((a, b) => b.distance - a.distance).slice(0, limit); 
}