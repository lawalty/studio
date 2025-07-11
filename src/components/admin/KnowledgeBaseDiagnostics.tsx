
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertTriangle, FileText, Search, Image as ImageIcon, Upload } from 'lucide-react';
import type { KnowledgeBaseLevel } from '@/app/admin/knowledge-base/page';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { testKnowledgeBase, type TestKnowledgeBaseInput, type TestKnowledgeBaseOutput } from '@/ai/flows/test-knowledge-base-flow';
import { useToast } from '@/hooks/use-toast';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';


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
  const [kbTestError, setKbTestError] = useState<string | null>(null);
  const { toast } = useToast();

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadResult, setImageUploadResult] = useState<{ status: 'success' | 'failure'; message: string } | null>(null);

  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualLevel, setManualLevel] = useState<KnowledgeBaseLevel>('High');
  const [isUploadingManual, setIsUploadingManual] = useState(false);
  const [manualUploadResult, setManualUploadResult] = useState<{ status: 'success' | 'failure'; message: string } | null>(null);

  const runImageUploadTest = async () => {
    setIsUploadingImage(true);
    setImageUploadResult(null);
    toast({ title: 'Starting Simple Image Upload Test...' });

    try {
      // 1. Fetch the placeholder image data
      const response = await fetch('https://placehold.co/100x100.png');
      if (!response.ok) throw new Error(`Failed to fetch placeholder image: ${response.statusText}`);
      const imageBlob = await response.blob();
      const imageFile = new File([imageBlob], "simple_image_test.png", { type: "image/png" });

      // 2. Define the storage path
      const storagePath = `knowledge_base_files/High/simple_image_test_${uuidv4()}.png`;
      const fileRef = ref(storage, storagePath);

      // 3. Upload the file
      await uploadBytes(fileRef, imageFile);

      // 4. Report success
      const successMessage = `Successfully uploaded ${imageFile.name} to storage.`;
      setImageUploadResult({ status: 'success', message: successMessage });
      toast({ title: 'Image Upload Successful!', description: 'The simple image upload test passed.' });

    } catch (e: any) {
      console.error("Simple image upload test failed:", e);
      const errorMessage = `Image upload failed: ${e.message || 'Unknown error'}`;
      setImageUploadResult({ status: 'failure', message: errorMessage });
      toast({ title: 'Image Upload Failed', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsUploadingImage(false);
    }
  };


  const runIngestionTest = async (testCase: TestCase) => {
    setIngestionTestResults(prev => ({ ...prev, [testCase.name]: { status: 'running', message: 'Starting test...' } }));

    const testFile = dataURIToFile(testCase.base64Data, testCase.fileName);
    if (!testFile) {
      setIngestionTestResults(prev => ({ ...prev, [testCase.name]: { status: 'failure', message: 'Failed to create test file from data URI. The data is likely malformed.' } }));
      return;
    }

    const testTopic = 'Diagnostics';
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

  const handleRunKbTest = async () => {
    setIsTestingKb(true);
    setKbTestResult(null);
    setKbTestError(null);
    toast({
      title: "Starting Knowledge Base Test",
      description: "Sending query to the retrieval pipeline...",
    });
    try {
      const input: TestKnowledgeBaseInput = { 
        query: kbTestQuery,
      };
      const result = await testKnowledgeBase(input);
      setKbTestResult(result);
    } catch (e: any) {
      setKbTestError(e.message || 'An unexpected error occurred while testing the knowledge base.');
    }
    setIsTestingKb(false);
  };

  const handleManualUpload = async () => {
    if (!manualFile) {
      toast({ title: 'No File Selected', description: 'Please select a file to upload.', variant: 'destructive' });
      return;
    }

    setIsUploadingManual(true);
    setManualUploadResult(null);
    toast({ title: `Uploading ${manualFile.name}...` });

    try {
      const result = await handleUpload(manualFile, manualLevel, 'General', 'Manual diagnostic upload.');
      if (result.success) {
        setManualUploadResult({ status: 'success', message: `Successfully uploaded and processed ${manualFile.name}.` });
        toast({ title: 'Manual Upload Successful', description: `${manualFile.name} is now in the knowledge base.` });
      } else {
        throw new Error(result.error || 'The upload function reported a failure.');
      }
    } catch (e: any) {
      console.error("Manual upload test failed:", e);
      const errorMessage = `Manual upload failed: ${e.message || 'Unknown error'}`;
      setManualUploadResult({ status: 'failure', message: errorMessage });
      toast({ title: 'Manual Upload Failed', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsUploadingManual(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/50">
        <CardHeader>
          <CardTitle className="font-headline">Ingestion Pipeline Diagnostics</CardTitle>
          <CardDescription>
            Run these automated tests to diagnose issues with the file processing pipeline (Upload, Text Extraction, and Indexing). Tests use built-in sample files and the &quot;Diagnostics&quot; topic.
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
                    disabled={isAnyOperationInProgress || isRunning || isUploadingImage}
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
          {/* New Image Upload Test */}
          <Card className="p-4 bg-background/50">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-semibold flex items-center gap-2">
                  <ImageIcon size={16} />
                  Simple Image Upload Run Test
                </h4>
                <p className="text-xs text-muted-foreground mt-1">Uploads a 100x100 placeholder image directly to storage, bypassing all other pipeline steps and Firestore.</p>
              </div>
              <Button
                onClick={runImageUploadTest}
                disabled={isAnyOperationInProgress || isUploadingImage || Object.values(ingestionTestResults).some(r => r?.status === 'running')}
                size="sm"
              >
                {isUploadingImage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Run Test
              </Button>
            </div>
            {imageUploadResult && (
              <Alert className="mt-4" variant={imageUploadResult.status === 'success' ? 'default' : 'destructive'}>
                {imageUploadResult.status === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                <AlertTitle>
                  {imageUploadResult.status === 'success' ? 'Image Upload Test Passed' : 'Image Upload Test Failed'}
                </AlertTitle>
                <AlertDescription className="text-xs break-words">
                  {imageUploadResult.message}
                </AlertDescription>
              </Alert>
            )}
          </Card>
          
          {/* Manual File Upload for Debugging */}
          <Card className="p-4 bg-background/50">
            <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold flex items-center gap-2">
                    <Upload size={16} />
                    Manual File Upload Test
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Directly upload a file to a specific KB level to test the upload and indexing flow.
                  </p>
                </div>
            </div>
            <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="manual-file">File</Label>
                    <Input id="manual-file" type="file" onChange={(e) => setManualFile(e.target.files ? e.target.files[0] : null)} disabled={isUploadingManual || isAnyOperationInProgress} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="manual-level">KB Level</Label>
                    <Select value={manualLevel} onValueChange={(v) => setManualLevel(v as KnowledgeBaseLevel)} disabled={isUploadingManual || isAnyOperationInProgress}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                 <Button
                    onClick={handleManualUpload}
                    disabled={isAnyOperationInProgress || isUploadingManual || !manualFile}
                    className="w-full"
                  >
                    {isUploadingManual && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Upload for Test
                  </Button>
            </div>
             {manualUploadResult && (
              <Alert className="mt-4" variant={manualUploadResult.status === 'success' ? 'default' : 'destructive'}>
                {manualUploadResult.status === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                <AlertTitle>
                  {manualUploadResult.status === 'success' ? 'Manual Upload Test Passed' : 'Manual Upload Test Failed'}
                </AlertTitle>
                <AlertDescription className="text-xs break-words">
                  {manualUploadResult.message}
                </AlertDescription>
              </Alert>
            )}
          </Card>
        </CardContent>
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
                <Label htmlFor="kb-test-query">Test Query</Label>
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
                    <h4 className="font-semibold">Test Results:</h4>
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
                                The vector search ran successfully but did not find any results in the knowledge base for your query that met the relevance threshold. Try a different query or check if relevant documents have been indexed.
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
