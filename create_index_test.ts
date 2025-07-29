
import { admin } from './src/lib/firebase-admin';
import { ai } from './src/ai/genkit';

async function generateIndexLink() {
  const firestore = admin.firestore();
  try {
    console.log('Attempting to run a query to generate the index creation link...');
    const queryEmbedding = Array(768).fill(0); // A dummy embedding for the query.
    const chunksCollection = firestore.collection('kb_chunks');
    const vectorQuery = chunksCollection.findNearest('embedding', queryEmbedding, {
      limit: 1,
      distanceMeasure: 'COSINE',
    });
    await vectorQuery.get();
  } catch (error: any) {
    console.error('Query failed as expected. Look for the index creation link in the error message below:');
    console.error(error.message);
  }
}

generateIndexLink();
