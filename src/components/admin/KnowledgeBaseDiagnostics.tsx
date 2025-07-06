
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertTriangle, FileText, Search } from 'lucide-react';
import type { KnowledgeBaseLevel } from '@/app/admin/knowledge-base/page';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Textarea } from '../ui/textarea';
import { testKnowledgeBase, type TestKnowledgeBaseInput, type TestKnowledgeBaseOutput } from '@/ai/flows/test-knowledge-base-flow';


// Define the shape of the test case
interface TestCase {
  name: string;
  description: string;
  fileName: string;
  base64Data: string;
  mimeType: string;
}

// Function to convert base64 data URI to a File object
const dataURIToFile = (dataURI: string, fileName: string): File | null => {
  try {
    const parts = dataURI.split(',');
    if (parts.length !== 2 || !parts[1]) {
      console.error("Invalid data URI format provided to dataURIToFile.", { dataURI: dataURI.substring(0, 50) + '...' });
      return null;
    }
    const byteString = atob(parts[1]);
    const mimeString = parts[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new File([ab], fileName, { type: mimeString });
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
    base64Data: 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKL1Jlc291cmNlcyA8PAovUHJvY1NldCBbL1BERiAvVGV4dF0KL0ZvbnQgPDwKL0YxIDQgMCBSCj4+Cj4+Ci9NZWRpYUJveCBbMCAwIDYxMiA3OTJdCj4+CmVuZG9iagozIDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9QYXJlbnQgMiAwIFIKL0NvbnRlbnRzIDUgMCBSCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9TdWJ0eXBlIC9UeXBlMQovQmFzZUZvbnQgL0hlbHZldGljYQo+PgplbmRvYmoKNSAwIG9iago8PAovTGVuZ3RoIDQxPj4Kc3RyZWFtCkJUCjcwIDcwMCBUZAovRjEgMTIgVGYKKFRoaXMgaXMgYSBzaW1wbGUgdGVzdCBQREYpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNzQgMDAwMDAgbiAKMDAwMDAwMDE3NCAwMDAwMCBuIAowMDAwMDAwMjc0IDAwMDAwIG4gCjAwMDAwMDAzNjIgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA2Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgo0MjkKJSVFT0YK',
  },
];

interface KnowledgeBaseDiagnosticsProps {
  handleUpload: (file: File, level: KnowledgeBaseLevel, topic: string, description: string) => Promise<{ success: boolean; error?: string }>;
  isAnyOperationInProgress: boolean;
}

export default function KnowledgeBaseDiagnostics({ handleUpload, isAnyOperationInProgress }: KnowledgeBaseDiagnosticsProps) {
  const [ingestionTestResults, setIngestionTestResults] = useState<Record<string, { status: 'running' | 'success' | 'failure'; message: string } | null>>({});
  
  // State for retrieval test
  const [isTestingKb, setIsTestingKb] = useState(false);
  const [kbTestResult, setKbTestResult] = useState<TestKnowledgeBaseOutput | null>(null);
  const [kbTestQuery, setKbTestQuery] = useState('What is the return policy?');
  const [kbTestLevels, setKbTestLevels] = useState<string[]>(['High', 'Medium', 'Low']);
  const [kbTestError, setKbTestError] = useState<string | null>(null);


  const runIngestionTest = async (testCase: TestCase) => {
    setIngestionTestResults(prev => ({ ...prev, [testCase.name]: { status: 'running', message: 'Starting test...' } }));

    const testFile = dataURIToFile(testCase.base64Data, testCase.fileName);
    if (!testFile) {
      setIngestionTestResults(prev => ({ ...prev, [testCase.name]: { status: 'failure', message: 'Failed to create test file from data URI. The data is likely malformed.' } }));
      return;
    }

    const testTopic = 'General';
    const testDescription = `Diagnostic test for: ${testCase.name}`;

    try {
      setIngestionTestResults(prev => ({ ...prev, [testCase.name]: { status: 'running', message: `Uploading ${testCase.fileName}...` } }));
      const result = await handleUpload(testFile, 'Low', testTopic, testDescription);

      if (result.success) {
        setIngestionTestResults(prev => ({ ...prev, [testCase.name]: { status: 'success', message: 'Pipeline completed successfully.' } }));
      } else {
        setIngestionTestResults(prev => ({ ...prev, [testCase.name]: { status: 'failure', message: `Pipeline failed unexpectedly. Error: ${result.error}` } }));
      }
    } catch (e: any) {
      setIngestionTestResults(prev => ({ ...prev, [testCase.name]: { status: 'failure', message: `A critical error occurred in the test runner: ${e.message}` } }));
    }
  };

  const handleLevelChange = (level: string, checked: boolean) => {
    setKbTestLevels(prev => {
        if (checked) {
            return [...prev, level];
        } else {
            return prev.filter(l => l !== level);
        }
    });
  };

  const handleRunKbTest = async () => {
    setIsTestingKb(true);
    setKbTestResult(null);
    setKbTestError(null);
    try {
      const levelsToTest = kbTestLevels.length > 0 ? kbTestLevels : undefined;
      const input: TestKnowledgeBaseInput = { 
        query: kbTestQuery,
        level: levelsToTest,
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
            Run these automated tests to diagnose issues with the file processing pipeline (Upload, Text Extraction, and Indexing). Tests use built-in sample files and the &quot;General&quot; topic.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {TEST_CASES.map((testCase) => {
            const result = ingestionTestResults[testCase.name];
            const isRunning = result?.status === 'running';

            return (
              <Card key={testCase.name} className="p-4 bg-background/50">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <FileText size={16} />
                      {testCase.name}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">{testCase.description}</p>
                  </div>
                  <Button
                    onClick={() => runIngestionTest(testCase)}
                    disabled={isAnyOperationInProgress || isRunning}
                    size="sm"
                  >
                    {isRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Run Test
                  </Button>
                </div>
                {result && (
                  <Alert className="mt-4" variant={result.status === 'success' ? 'default' : (result.status === 'failure' ? 'destructive' : 'default')}>
                    {result.status === 'success' && <CheckCircle className="h-4 w-4" />}
                    {result.status === 'failure' && <AlertTriangle className="h-4 w-4" />}
                    {result.status === 'running' && <Loader2 className="h-4 w-4 animate-spin" />}
                    <AlertTitle>
                      {result.status === 'success' ? 'Test Passed' : (result.status === 'failure' ? 'Test Failed' : 'Test Running')}
                    </AlertTitle>
                    <AlertDescription className="text-xs break-words">
                      {result.message}
                    </AlertDescription>
                  </Alert>
                )}
              </Card>
            );
          })}
        </CardContent>
      </Card>
      
      <Card className="border-primary/50">
        <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2">
                <Search className="h-5 w-5" />
                Retrieval Pipeline Test
            </CardTitle>
            <CardDescription>
                Manually test the RAG retrieval by embedding a query and searching the vector database.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="space-y-2">
                <Label htmlFor="kbTestQuery">Test Query</Label>
                <Input id="kbTestQuery" value={kbTestQuery} onChange={(e) => setKbTestQuery(e.target.value)} disabled={isTestingKb || isAnyOperationInProgress} />
            </div>
             <div className="mt-4 space-y-2">
                <Label>Priority Levels</Label>
                <div className="flex items-center space-x-4">
                    {['High', 'Medium', 'Low'].map(level => (
                         <div key={level} className="flex items-center space-x-2">
                            <Checkbox
                                id={`level-${level}`}
                                checked={kbTestLevels.includes(level)}
                                onCheckedChange={(checked) => handleLevelChange(level, !!checked)}
                                disabled={isTestingKb || isAnyOperationInProgress}
                            />
                            <Label htmlFor={`level-${level}`} className="font-normal">{level}</Label>
                        </div>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">Select levels to include in the search. Uncheck all to search everything.</p>
            </div>
            <Button onClick={handleRunKbTest} disabled={isTestingKb || isAnyOperationInProgress} className="mt-4">
                {isTestingKb && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Run Search Test
            </Button>
            {(kbTestResult || kbTestError) && (
                <Alert className="mt-4" variant={kbTestResult ? "default" : "destructive"}>
                    {kbTestResult ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    <AlertTitle>{kbTestResult ? "Success" : "Failed"}</AlertTitle>
                    <AlertDescription className="text-xs break-words">
                        {kbTestError
                            ? kbTestError
                            : kbTestResult && kbTestResult.searchResult?.length > 0
                            ? `Successfully retrieved ${kbTestResult.searchResult.length} chunk(s) from the knowledge base.`
                            : "Search was successful, but no relevant chunks were found for this query."}
                    </AlertDescription>
                </Alert>
            )}
            {kbTestResult?.retrievedContext && (
                <div className="mt-4">
                    <Label className="text-xs font-bold">Retrieved Context for LLM</Label>
                    <Textarea readOnly value={kbTestResult.retrievedContext} className="mt-1 h-48 text-xs bg-muted" />
                </div>
            )}
        </CardContent>
    </Card>
    </div>
  );
}
