'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertTriangle, FileText, FileQuestion } from 'lucide-react';
import type { KnowledgeBaseLevel } from '@/app/admin/knowledge-base/page';

// Define the shape of the test case
interface TestCase {
  name: string;
  description: string;
  fileName: string;
  base64Data: string;
  mimeType: string;
  expectedResult: 'success' | 'failure';
}

// Function to convert base64 data URI to a File object
const dataURIToFile = (dataURI: string, fileName: string): File => {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new File([ab], fileName, { type: mimeString });
};

// Define our test cases
const TEST_CASES: TestCase[] = [
  {
    name: 'Simple TXT File',
    description: 'Tests the basic pipeline with a standard, readable text file.',
    fileName: 'test_simple.txt',
    mimeType: 'text/plain',
    base64Data: 'data:text/plain;base64,SGVsbG8sIHdvcmxkISBUaGlzIGlzIGEgdGVzdCBvZiB0aGUgUklQIEZpcmVzdG9yZSBUZXh0IEluZGV4aW5nIFBpcGVsaW5lLg==', // "Hello, world! This is a test of the RIP Firestore Text Indexing Pipeline."
    expectedResult: 'success',
  },
  {
    name: 'Simple PDF File',
    description: 'Tests PDF processing and smart text extraction.',
    fileName: 'test_simple.pdf',
    mimeType: 'application/pdf',
    base64Data: 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKL1Jlc291cmNlcyA8PAovUHJvY1NldCBbL1BERiAvVGV4dF0KL0ZvbnQgPDwKL0YxIDQgMCBSCj4+Cj4+Ci9NZWRpYUJveCBbMCAwIDYxMiA3OTJdCj4+CmVuZG9iagozIDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9QYXJlbnQgMiAwIFIKL0NvbnRlbnRzIDUgMCBSCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9TdWJ0eXBlIC9UeXBlMQovQmFzZUZvbnQgL0hlbHZldGljYQo+PgplbmRvYmoKNSAwIG9iago8PAovTGVuZ3RoIDQxPj4Kc3RyZWFtCkJUCjcwIDcwMCBUZAovRjEgMTIgVGYKKFRoaXMgaXMgYSBzaW1wbGUgdGVzdCBQREYpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNzQgMDAwMDAgbiAKjAwMDAwMDAxNzQgMDAwMDAgbiAKjAwMDAwMDAyNzQgMDAwMDAgbiAKjAwMDAwMDAzNjIgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA2Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgo0MjkKJSVFT0YK',
    expectedResult: 'success',
  },
  {
    name: 'Empty TXT File',
    description: 'Tests failure handling for documents with no extractable text.',
    fileName: 'test_empty.txt',
    mimeType: 'text/plain',
    base64Data: 'data:text/plain;base64,', // Empty
    expectedResult: 'failure',
  },
];

interface KnowledgeBaseDiagnosticsProps {
  handleUpload: (file: File, level: KnowledgeBaseLevel, topic: string, description: string) => Promise<{ success: boolean; error?: string }>;
  isAnyOperationInProgress: boolean;
}

export default function KnowledgeBaseDiagnostics({ handleUpload, isAnyOperationInProgress }: KnowledgeBaseDiagnosticsProps) {
  const [testResults, setTestResults] = useState<Record<string, { status: 'running' | 'success' | 'failure'; message: string } | null>>({});

  const runTest = async (testCase: TestCase) => {
    setTestResults(prev => ({ ...prev, [testCase.name]: { status: 'running', message: 'Starting test...' } }));

    const testFile = dataURIToFile(testCase.base64Data, testCase.fileName);
    const testTopic = 'Diagnostics';
    const testDescription = `Diagnostic test for: ${testCase.name}`;

    try {
      setTestResults(prev => ({ ...prev, [testCase.name]: { status: 'running', message: `Uploading ${testCase.fileName}...` } }));
      const result = await handleUpload(testFile, 'Low', testTopic, testDescription);

      if (result.success) {
        if (testCase.expectedResult === 'success') {
          setTestResults(prev => ({ ...prev, [testCase.name]: { status: 'success', message: 'Pipeline completed successfully as expected.' } }));
        } else {
          setTestResults(prev => ({ ...prev, [testCase.name]: { status: 'failure', message: 'Test SUCCEEDED but was expected to FAIL. The pipeline might not be handling this edge case correctly.' } }));
        }
      } else {
        if (testCase.expectedResult === 'failure') {
          setTestResults(prev => ({ ...prev, [testCase.name]: { status: 'success', message: `Pipeline failed as expected. Error: ${result.error}` } }));
        } else {
          setTestResults(prev => ({ ...prev, [testCase.name]: { status: 'failure', message: `Pipeline failed unexpectedly. Error: ${result.error}` } }));
        }
      }
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [testCase.name]: { status: 'failure', message: `A critical error occurred in the test runner: ${e.message}` } }));
    }
  };

  return (
    <Card className="border-primary/50">
      <CardHeader>
        <CardTitle className="font-headline">Knowledge Base Pipeline Diagnostics</CardTitle>
        <CardDescription>
          Run these automated tests to diagnose issues with the file processing pipeline (Upload, Text Extraction, and Indexing). Tests use built-in sample files.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {TEST_CASES.map((testCase) => {
          const result = testResults[testCase.name];
          const isRunning = result?.status === 'running';

          return (
            <Card key={testCase.name} className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold flex items-center gap-2">
                    {testCase.expectedResult === 'success' ? <FileText size={16} /> : <FileQuestion size={16} />}
                    {testCase.name}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">{testCase.description}</p>
                </div>
                <Button
                  onClick={() => runTest(testCase)}
                  disabled={isAnyOperationInProgress}
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
  );
}
