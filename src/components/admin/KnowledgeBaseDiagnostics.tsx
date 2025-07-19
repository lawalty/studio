
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertTriangle, FileText, Search } from 'lucide-react';
import type { KnowledgeBaseLevel } from '@/app/admin/knowledge-base/page';
import { Textarea } from '../ui/textarea';
import { testKnowledgeBase, type TestKnowledgeBaseInput, type TestKnowledgeBaseOutput } from '@/ai/flows/test-knowledge-base-flow';
import { useToast } from '@/hooks/use-toast';
import type { useToast as useToastType } from '@/hooks/use-toast';


// Define the shape of the test case
interface TestCase {
  name: string;
  description: string;
  fileName: string;
  mimeType: string;
  base64Data: string;
}

// Function to convert base64 data URI to a File object
const dataURIToFile = (dataURI: string, fileName: string): File | null => {
  try {
    const parts = dataURI.split(',');
    if (parts.length !== 2 || !parts[0].includes('base64')) {
      console.error("Invalid data URI format provided to dataURIToFile.", { dataURI: dataURI.substring(0, 50) + '...' });
      return null;
    }
    const mimeString = parts[0].split(':')[1].split(';')[0];
    const byteCharacters = atob(parts[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new File([byteArray], fileName, { type: mimeString });
  } catch (e) {
    console.error("Failed to decode base64 string in dataURIToFile:", e);
    return null;
  }
};


// Define our test cases
const TEST_CASES: TestCase[] = [
  {
    name: 'Simple TXT File',
    description: 'Tests the basic pipeline with a standard, readable text file.',
    fileName: 'test_simple.txt',
    mimeType: 'text/plain',
    base64Data: 'data:text/plain;base64,SGVsbG8sIHdvcmxkISBUaGlzIGlzIGEgdGVzdCBvZiB0aGUgUklQIEZpcmVzdG9yZSBUZXh0IEluZGV4aW5nIFBpcGVsaW5lLg==', // "Hello, world! This is a test of the RIP Firestore Text Indexing Pipeline."
  },
  {
    name: 'Simple PDF File',
    description: 'Tests PDF processing and smart text extraction from a common document type.',
    fileName: 'test_simple.pdf',
    mimeType: 'application/pdf',
    base64Data: 'data:application/pdf;base64,JVBERi0xLjQKJdPr6eEKMSAwIG9iago8PC9UeXBlIC9DYXRhbG9nL1BhZ2VzIDIgMCBSPj4KZW5kb2JqCjIgMCBvYmoKPDwvVHlwZSAvUGFnZXMvQ291bnQgMS9LaWRzIFszIDAgUl0+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlIC9QYWdlL1BhcmVudCAyIDAgUi9SZXNvdXJjZXMgPDwvRm9udCA8PC9GMSA0IDAgUj4+L1Byb2NTZXQgWy9QREYgL1RleHRdPj4vTWVkaWFCb3ggWzAgMCA2MTIgNzkyXS9Db250ZW50cyA1IDAgUj4+CmVuZG9iago0IDAgb2JqCjw8L1R5cGUgL0ZvbnQvU3VidHlwZSAvVHlwZTEvQmFzZUZvbnQgL0hlbHZldGljYT4+CmVuZG9iago1IDAgb2JqCjw8L0xlbmd0aCA0ND4+CnN0cmVhbQpCVCAvRjEgMTIgVGYgNzAgNzAwIFRkIChUaGlzIGlzIGEgc2ltcGxlIHRlc3QgUERGLikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgNjU1MzUgZiAKMDAwMDAwMDA2MyA2NTUzNSBmIAowMDAwMDAwMTA5IDY1NTUzNSBmIAowMDAwMDAwMjM0IDY1NTMzNSBmIAowMDAwMDAwMzAzIDY1NTM1IGYgCnRyYWlsZXIKPDwvU2l6ZSA2L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKMzg4CiUlRU9GCg==',
  },
];

interface KnowledgeBaseDiagnosticsProps {
  isAnyOperationInProgress: boolean;
  currentThreshold: number;
}

export default function KnowledgeBaseDiagnostics({ isAnyOperationInProgress, currentThreshold }: KnowledgeBaseDiagnosticsProps) {
  const [ingestionTestResults, setIngestionTestResults] = useState<Record<string, { status: 'running' | 'success' | 'failure'; message: string } | null>>({});
  
  // State for retrieval test
  const [isTestingKb, setIsTestingKb] = useState(false);
  const [kbTestResult, setKbTestResult] = useState<TestKnowledgeBaseOutput | null>(null);
  const [kbTestQuery, setKbTestQuery] = useState('When did you join EZCORP?');
  const [kbTestError, setKbTestError] = useState<string | null>(null);
  const { toast } = useToast();

  const runIngestionTest = async (testCase: TestCase) => {
    // This function is complex and tightly coupled with the parent state.
    // For simplicity, we now just trigger the parent's upload function
    // after setting the file and topic appropriately.
    // This is a placeholder for a more advanced diagnostic if needed in the future.
    toast({
      title: 'Manual Trigger Required',
      description: 'Please set the file, topic, and level in the main upload form and click "Upload and Process" to run a test.',
    });
  };

  const handleRunKbTest = async () => {
    setIsTestingKb(true);
    setKbTestResult(null);
    setKbTestError(null);
    toast({
      title: "Starting Knowledge Base Test",
      description: `Sending query with threshold ${currentThreshold}...`,
    });
    try {
      const input: TestKnowledgeBaseInput = { 
        query: kbTestQuery,
        distanceThreshold: currentThreshold
      };
      const result = await testKnowledgeBase(input);
      setKbTestResult(result);
    } catch (e: any) {
      setKbTestError(e.message || 'An unexpected error occurred while testing the knowledge base.');
    }
    setIsTestingKb(false);
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/50">
        <CardHeader>
          <CardTitle className="font-headline">Ingestion Pipeline Diagnostics</CardTitle>
          <CardDescription>
            To run a diagnostic, please use the main &quot;Upload New Source&quot; form above. Select a file, set the topic to &quot;Diagnostics&quot; and the priority to &quot;Low&quot;, then click &quot;Upload and Process&quot;.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Card className="border-primary/50">
          <CardHeader>
              <CardTitle className="font-headline">Retrieval Pipeline Diagnostics</CardTitle>
              <CardDescription>
                Test the retrieval (RAG) part of the pipeline by sending a query to the vector search backend. This does not use the conversational AI, it only shows the raw context that would be sent to the AI.
              </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
                <label htmlFor="kb-test-query" className="font-medium">Test Query</label>
                <Textarea 
                    id="kb-test-query"
                    value={kbTestQuery}
                    onChange={(e) => setKbTestQuery(e.target.value)}
                    placeholder="Enter a question to test the knowledge base..."
                />
            </div>
             <Button onClick={handleRunKbTest} disabled={isTestingKb || isAnyOperationInProgress}>
                {isTestingKb && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Search className="mr-2 h-4 w-4" />
                Test Retrieval
            </Button>
            {kbTestError && (
                 <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Retrieval Test Failed</AlertTitle>
                    <AlertDescription className="text-xs break-words whitespace-pre-wrap">{kbTestError}</AlertDescription>
                </Alert>
            )}
            {kbTestResult && (
                <div className="mt-4 space-y-2">
                    <h4 className="font-semibold">Test Results (Threshold: {currentThreshold}):</h4>
                    {Array.isArray(kbTestResult.searchResult) && kbTestResult.searchResult.length > 0 ? (
                        <Alert variant="default" className="max-h-96 overflow-y-auto">
                            <CheckCircle className="h-4 w-4" />
                            <AlertTitle>Found {kbTestResult.searchResult.length} Relevant Chunks</AlertTitle>
                            <AlertDescription>
                                {kbTestResult.searchResult.map((result: any, index: number) => (
                                    <div key={index} className="mt-2 p-2 border rounded-md text-xs bg-muted/50">
                                        <p><strong>Source:</strong> {result.sourceName} (L: {result.level}, T: {result.topic})</p>
                                        <p><strong>Text:</strong> &quot;{result.text}&quot;</p>
                                        <p><strong>Distance:</strong> {result.distance.toFixed(4)}</p>
                                    </div>
                                ))}
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>No Relevant Chunks Found</AlertTitle>
                            <AlertDescription>
                                The vector search ran successfully but did not find any results in the knowledge base for your query that met the relevance threshold of {currentThreshold}. Try a different query or increase the threshold using the slider above.
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            )}
          </CardContent>
      </Card>
    </div>
  );
}

