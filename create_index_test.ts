
import { admin } from './src/lib/firebase-admin';

async function generateIndexLink() {
  const firestore = admin.firestore();
  try {
    console.log('Attempting to run a query to generate the index creation link...');
    const queryEmbedding = Array(768).fill(0); // A dummy embedding for the query.
    // Query the collection group where all chunks are stored, regardless of the source document.
    const vectorQuery = firestore.collectionGroup('kb_chunks').findNearest('embedding', queryEmbedding, {
      limit: 1,
      distanceMeasure: 'COSINE',
    });
    await vectorQuery.get();
    console.log("Query succeeded unexpectedly. This means the index might already exist. If search is still failing, please check the index status in the Google Cloud Console for Firestore.");
  } catch (error: any) {
    console.error('Query failed as expected. Look for the index creation link in the error message below:');
    console.error(error.message);
  }
}

generateIndexLink();
