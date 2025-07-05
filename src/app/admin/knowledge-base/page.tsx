
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, storage } from '@/lib/firebase';
import { collection, onSnapshot, doc, getDoc, setDoc, writeBatch, query, where, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { extractTextFromDocumentUrl, type ExtractTextFromDocumentUrlInput } from '@/ai/flows/extract-text-from-document-url-flow';
import { indexDocument, type IndexDocumentInput } from '@/ai/flows/index-document-flow';
import { Loader2, UploadCloud, Trash2, ShieldAlert, FileText, CheckCircle, AlertTriangle, ChevronRight, ChevronsRight, ChevronsLeft, History, Archive, RotateCcw, Wrench } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import KnowledgeBaseDiagnostics from '@/components/admin/KnowledgeBaseDiagnostics';

// Exporting this type for use in the diagnostics component
export type KnowledgeBaseLevel = 'High' | 'Medium' | 'Low' | 'Archive';

interface KnowledgeSource {
  id: string;
  sourceName: string;
  description: string;
  topic: string;
  level: KnowledgeBaseLevel;
  createdAt: string;
  indexingStatus: 'processing' | 'success' | 'failed';
  indexingError?: string;
  downloadURL?: string;
  chunksWritten?: number;
}

const LEVEL_CONFIG: Record<KnowledgeBaseLevel, { collectionName: string; title: string; description: string }> = {
  'High': { collectionName: 'kb_high_meta_v1', title: 'High Priority Knowledge Base', description: 'Manage high priority sources.' },
  'Medium': { collectionName: 'kb_medium_meta_v1', title: 'Medium Priority Knowledge Base', description: 'Manage medium priority sources.' },
  'Low': { collectionName: 'kb_low_meta_v1', title: 'Low Priority Knowledge Base', description: 'Manage low priority sources.' },
  'Archive': { collectionName: 'kb_archive_meta_v1', title: 'Archived Knowledge Base', description: 'Archived sources are not used by the AI.' },
};

export default function KnowledgeBasePage() {
  const [sources, setSources] = useState<Record<KnowledgeBaseLevel, KnowledgeSource[]>>({ 'High': [], 'Medium': [], 'Low': [], 'Archive': [] });
  const [isLoading, setIsLoading] = useState<Record<KnowledgeBaseLevel, boolean>>({ 'High': true, 'Medium': true, 'Low': true, 'Archive': true });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isCurrentlyUploading, setIsCurrentlyUploading] = useState(false);
  const [availableTopics, setAvailableTopics] = useState<string[]>([]);
  const [selectedTopicForUpload, setSelectedTopicForUpload] = useState<string>('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [selectedLevelForUpload, setSelectedLevelForUpload] = useState<KnowledgeBaseLevel>('High');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeAccordionItem, setActiveAccordionItem] = useState<string>('high-priority');
  const [operationInProgress, setOperationInProgress] = useState<Record<string, boolean>>({});

  const anyOperationGloballyInProgress = Object.values(operationInProgress).some(status => status);

  const setOperationStatus = (id: string, status: boolean) => {
    setOperationInProgress(prev => ({ ...prev, [id]: status }));
  };

  useEffect(() => {
    const fetchTopics = async () => {
      const docRef = doc(db, 'configurations/site_display_assets');
      try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Adding 'Diagnostics' topic for the new test runner
          const topicsString = data.conversationalTopics || '';
          let topicsArray = topicsString.split(',').map((t: string) => t.trim()).filter((t: string) => t);
          if (!topicsArray.includes('Diagnostics')) {
            topicsArray.push('Diagnostics');
          }
          setAvailableTopics(topicsArray);
          if (topicsArray.length > 0 && !topicsArray.includes(selectedTopicForUpload)) {
            setSelectedTopicForUpload(topicsArray.find(t => t !== 'Diagnostics') || topicsArray[0]);
          }
        }
      } catch (error) {
        console.error("Error fetching topics:", error);
      }
    };
    fetchTopics();
  }, [selectedTopicForUpload]);

  useEffect(() => {
    const unsubscribers = Object.entries(LEVEL_CONFIG).map(([level, config]) => {
      const q = query(collection(db, config.collectionName));
      return onSnapshot(q, (querySnapshot) => {
        const levelSources: KnowledgeSource[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          levelSources.push({
            id: doc.id,
            sourceName: data.sourceName || 'Unknown Source',
            description: data.description || '',
            topic: data.topic || 'General',
            level: level as KnowledgeBaseLevel,
            createdAt: data.createdAt ? new Date(data.createdAt).toLocaleString() : 'Unknown date',
            indexingStatus: data.indexingStatus || 'failed',
            indexingError: data.indexingError || 'No status available.',
            downloadURL: data.downloadURL,
            chunksWritten: data.chunksWritten
          });
        });
        setSources(prevSources => ({ ...prevSources, [level as KnowledgeBaseLevel]: levelSources.sort((a,b) => b.createdAt.localeCompare(a.createdAt)) }));
        setIsLoading(prevLoading => ({ ...prevLoading, [level as KnowledgeBaseLevel]: false }));
      }, (error) => {
        console.error(`Error fetching ${level} priority sources:`, error);
        setIsLoading(prevLoading => ({ ...prevLoading, [level as KnowledgeBaseLevel]: false }));
      });
    });

    return () => unsubscribers.forEach(unsub => unsub());
  }, []);

  const handleUpload = useCallback(async (fileToUpload: File, targetLevel: KnowledgeBaseLevel, topic: string, description: string): Promise<{ success: boolean; error?: string }> => {
    if (!fileToUpload || !topic) {
        toast({ title: "Upload Error", description: "A file and topic are required.", variant: "destructive" });
        return { success: false, error: "A file and topic are required." };
    }

    const sourceId = uuidv4();
    setOperationStatus(sourceId, true);
    setIsCurrentlyUploading(true);

    const placeholderDocRef = doc(db, LEVEL_CONFIG[targetLevel].collectionName, sourceId);
    let storageRef;

    try {
        await setDoc(placeholderDocRef, {
            id: sourceId,
            sourceName: fileToUpload.name,
            description,
            topic,
            level: targetLevel,
            createdAt: new Date().toISOString(),
            indexingStatus: 'processing',
        });
        toast({ title: `Processing: ${fileToUpload.name}`, description: "Uploading file..." });

        const storagePath = `knowledge_base_files/${targetLevel}/${sourceId}-${fileToUpload.name}`;
        storageRef = ref(storage, storagePath);
        const uploadResult = await uploadBytes(storageRef, fileToUpload);
        const downloadURL = await getDownloadURL(uploadResult.ref);
        await updateDoc(placeholderDocRef, { downloadURL });
        
        toast({ title: "Upload Successful", description: "Extracting text...", variant: "default" });

        const extractionInput: ExtractTextFromDocumentUrlInput = { documentUrl: downloadURL, conversationalTopics: topic };
        const extractionResult = await extractTextFromDocumentUrl(extractionInput);
        
        if (!extractionResult || extractionResult.error || !extractionResult.extractedText) {
            throw new Error(extractionResult?.error || 'Text extraction failed to produce content.');
        }

        toast({ title: "Text Ready", description: "Indexing for RAG pipeline...", variant: "default" });

        const indexingInput: IndexDocumentInput = {
            sourceId,
            sourceName: fileToUpload.name,
            text: extractionResult.extractedText,
            level: targetLevel,
            topic,
            downloadURL,
        };
        const indexingResult = await indexDocument(indexingInput);

        if (!indexingResult.success) {
            throw new Error(indexingResult.error || 'The indexing flow failed without a specific error.');
        }

        toast({ title: "Indexing Complete", description: `${fileToUpload.name} is now in the knowledge base.`, variant: "default" });
        return { success: true };

    } catch (e: any) {
        const errorMessage = e.message || 'An unknown processing error occurred.';
        console.error(`[handleUpload] Failed to process ${fileToUpload.name}:`, e);
        toast({ title: "Processing Failed", description: errorMessage, variant: "destructive", duration: 10000 });
        
        try {
            if (errorMessage.includes('Text extraction')) {
                 if (storageRef) {
                    await deleteObject(storageRef).catch(delErr => console.error("Failed to cleanup storage file on extraction error:", delErr));
                 }
                 await deleteDoc(placeholderDocRef).catch(delErr => console.error("Failed to cleanup firestore doc on extraction error:", delErr));
                 toast({ description: "The failed source has been automatically removed.", variant: "default" });
            } else {
                await updateDoc(placeholderDocRef, {
                    indexingStatus: 'failed',
                    indexingError: errorMessage,
                });
            }
        } catch (cleanupError) {
             console.error(`[handleUpload] CRITICAL: Failed to update or delete Firestore doc for failed source ${sourceId}`, cleanupError);
             toast({ title: "Cleanup Failed", description: "Could not fully update the status of the failed item.", variant: "destructive" });
        }
        return { success: false, error: errorMessage };
    } finally {
        setOperationStatus(sourceId, false);
        setIsCurrentlyUploading(false);
    }
  }, [toast]);


  const handleFileUpload = async () => {
    if (!selectedFile || !selectedTopicForUpload) {
      toast({ title: "Missing Information", description: "Please select a file and a topic.", variant: "destructive" });
      return;
    }
    // The handleUpload function now internally handles all UI updates like toasts and status.
    await handleUpload(selectedFile, selectedLevelForUpload, selectedTopicForUpload, uploadDescription);
    
    // Reset form fields after the attempt.
    setSelectedFile(null);
    setUploadDescription('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleDeleteSource = useCallback(async (source: KnowledgeSource) => {
    setOperationStatus(source.id, true);
    toast({ title: `Deleting ${source.sourceName}...` });
    try {
      const batch = writeBatch(db);
      const chunksQuery = query(collection(db, 'kb_chunks'), where('sourceId', '==', source.id));
      const chunksSnapshot = await getDocs(chunksQuery);
      chunksSnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      if (source.downloadURL) {
        try {
          const fileRef = ref(storage, source.downloadURL);
          await deleteObject(fileRef);
        } catch (storageError: any) {
          if (storageError.code !== 'storage/object-not-found') {
            throw storageError;
          }
        }
      }

      await deleteDoc(doc(db, LEVEL_CONFIG[source.level].collectionName, source.id));
      toast({ title: "Deletion Successful", description: `${source.sourceName} has been completely removed.`, variant: "default" });
    } catch (error: any) {
      console.error("Error deleting source:", error);
      toast({ title: "Deletion Failed", description: `Could not delete ${source.sourceName}. ${error.message}`, variant: "destructive" });
    } finally {
      setOperationStatus(source.id, false);
    }
  }, []);

  const handleDeleteAllByLevel = useCallback(async (level: KnowledgeBaseLevel) => {
    setOperationStatus(`delete-all-${level}`, true);
    const levelSources = sources[level];
    if (levelSources.length === 0) {
        toast({title: `No sources to delete in ${level}.`});
        setOperationStatus(`delete-all-${level}`, false);
        return;
    }

    toast({ title: `Deleting all ${level} sources...`, description: "This may take a moment." });
    try {
        for (const source of levelSources) {
            // We don't want the individual items to look disabled, just the main buttons.
            // setOperationStatus(source.id, true);
            const batch = writeBatch(db);
            const chunksQuery = query(collection(db, 'kb_chunks'), where('sourceId', '==', source.id));
            const chunksSnapshot = await getDocs(chunksQuery);
            chunksSnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();

            if (source.downloadURL) {
                try {
                    const fileRef = ref(storage, source.downloadURL);
                    await deleteObject(fileRef);
                } catch (storageError: any) {
                    if (storageError.code !== 'storage/object-not-found') {
                        console.warn(`Could not delete storage file for ${source.sourceName}: ${storageError.message}`);
                    }
                }
            }
            await deleteDoc(doc(db, LEVEL_CONFIG[source.level].collectionName, source.id));
        }
        toast({ title: `All ${level} sources deleted.`, variant: "default" });
    } catch (error: any) {
        console.error(`Error deleting all ${level} sources:`, error);
        toast({ title: `Failed to delete all ${level} sources.`, description: error.message, variant: "destructive" });
    } finally {
        levelSources.forEach(source => setOperationStatus(source.id, false));
        setOperationStatus(`delete-all-${level}`, false);
    }
  }, [sources]);

  const handleMoveSource = useCallback(async (source: KnowledgeSource, newLevel: KnowledgeBaseLevel) => {
      if (source.level === newLevel) return;
      setOperationStatus(source.id, true);
      toast({ title: `Moving ${source.sourceName} to ${newLevel}...` });

      try {
          const originalDocRef = doc(db, LEVEL_CONFIG[source.level].collectionName, source.id);
          const docSnap = await getDoc(originalDocRef);
          if (!docSnap.exists()) {
              throw new Error("Original source document not found.");
          }
          const sourceData = docSnap.data();

          const newDocData = { ...sourceData, level: newLevel };
          const newDocRef = doc(db, LEVEL_CONFIG[newLevel].collectionName, source.id);
          
          const chunksQuery = query(collection(db, 'kb_chunks'), where('sourceId', '==', source.id));
          const chunksSnapshot = await getDocs(chunksQuery);

          const writeBatchForMove = writeBatch(db);

          writeBatchForMove.set(newDocRef, newDocData);
          writeBatchForMove.delete(originalDocRef);
          chunksSnapshot.forEach(chunkDoc => {
              writeBatchForMove.update(chunkDoc.ref, { level: newLevel });
          });

          await writeBatchForMove.commit();
          toast({ title: "Move Successful", description: `${source.sourceName} moved to ${newLevel}.`, variant: "default" });

      } catch (error: any) {
          console.error("Error moving source:", error);
          toast({ title: "Move Failed", description: `Could not move ${source.sourceName}. ${error.message}`, variant: "destructive" });
      } finally {
          setOperationStatus(source.id, false);
      }
  }, []);

  const handleReindexSource = useCallback(async (source: KnowledgeSource) => {
      setOperationStatus(source.id, true);
      const sourceDocRef = doc(db, LEVEL_CONFIG[source.level].collectionName, source.id);
  
      try {
          if (!source.downloadURL) throw new Error("Source has no download URL, cannot re-process.");
          
          await updateDoc(sourceDocRef, {
              indexingStatus: 'processing',
              indexingError: '',
              chunksWritten: 0,
          });
  
          toast({ title: `Re-processing ${source.sourceName}...` });
  
          const chunksQuery = query(collection(db, 'kb_chunks'), where('sourceId', '==', source.id));
          const chunksSnapshot = await getDocs(chunksQuery);
          if (!chunksSnapshot.empty) {
              const batch = writeBatch(db);
              chunksSnapshot.forEach(doc => batch.delete(doc.ref));
              await batch.commit();
              toast({ description: "Cleared old indexed data." });
          }
          
          toast({ description: "Re-extracting text..." });
          const extractionInput: ExtractTextFromDocumentUrlInput = { documentUrl: source.downloadURL, conversationalTopics: source.topic };
          const extractionResult = await extractTextFromDocumentUrl(extractionInput);
          
          if (!extractionResult || extractionResult.error || !extractionResult.extractedText) {
              throw new Error(extractionResult?.error || 'Text re-extraction failed to produce content.');
          }
  
          toast({ description: "Re-indexing text..." });
          const indexingInput: IndexDocumentInput = {
              sourceId: source.id,
              sourceName: source.sourceName,
              text: extractionResult.extractedText,
              level: source.level,
              topic: source.topic,
              downloadURL: source.downloadURL,
          };
  
          const indexingResult = await indexDocument(indexingInput);
  
          if (!indexingResult.success) {
              throw new Error(indexingResult.error || 'The re-indexing flow failed.');
          }
          
          toast({ title: "Re-indexing Successful", description: `${source.sourceName} is now up-to-date.`, variant: "default" });
  
      } catch (error: any) {
          const errorMessage = error.message || "An unknown error occurred during re-indexing.";
          toast({ title: `Error Re-indexing`, description: errorMessage, variant: "destructive", duration: 10000 });
          
          await updateDoc(sourceDocRef, {
              indexingStatus: 'failed',
              indexingError: errorMessage
          }).catch(updateError => console.error("Error updating doc with failure status after re-indexing attempt:", updateError));
      } finally {
          setOperationStatus(source.id, false);
      }
  }, [toast]);
  

  const renderSourceCard = (source: KnowledgeSource) => {
    const isOperationInProgress = operationInProgress[source.id] || false;
    const isProcessingFailure = source.indexingStatus === 'failed';

    return (
      <Card key={source.id} className={cn("mb-4 transition-all", isOperationInProgress && "opacity-50 cursor-not-allowed")}>
        <CardHeader className="flex flex-row justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText size={20} />
              {source.sourceName}
            </CardTitle>
            <CardDescription>
              Topic: {source.topic} | Added: {source.createdAt}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isProcessingFailure && (
                 <Button variant="outline" size="icon" title="Re-process source" onClick={() => handleReindexSource(source)} disabled={isOperationInProgress || anyOperationGloballyInProgress} className="text-primary hover:bg-primary/10">
                    <RotateCcw size={16} />
                </Button>
            )}
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="icon" disabled={isOperationInProgress || anyOperationGloballyInProgress}><Trash2 size={16} /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the source and all its indexed data. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteSource(source)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-4">{source.description || "No description provided."}</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 rounded-md bg-muted">
             {source.indexingStatus === 'success' && <> <CheckCircle size={16} className="text-green-500" /> <span>Indexing complete. {source.chunksWritten ?? 0} chunks written.</span> </>}
             {source.indexingStatus === 'processing' && <> <Loader2 size={16} className="animate-spin" /> <span>Processing...</span> </>}
             {source.indexingStatus === 'failed' && <> <AlertTriangle size={16} className="text-destructive" /> <span>Failure: {source.indexingError}</span> </>}
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
            {source.level !== 'Archive' && <Button size="sm" variant="outline" onClick={() => handleMoveSource(source, 'Archive')} disabled={isOperationInProgress || anyOperationGloballyInProgress}><Archive className="mr-2 h-4 w-4" />Archive</Button>}
            {source.level !== 'Low' && <Button size="sm" variant="outline" onClick={() => handleMoveSource(source, 'Low')} disabled={isOperationInProgress || anyOperationGloballyInProgress}><ChevronsLeft className="mr-2 h-4 w-4" />To Low</Button>}
            {source.level !== 'Medium' && <Button size="sm" variant="outline" onClick={() => handleMoveSource(source, 'Medium')} disabled={isOperationInProgress || anyOperationGloballyInProgress}><ChevronRight className="mr-2 h-4 w-4" />To Medium</Button>}
            {source.level !== 'High' && <Button size="sm" variant="outline" onClick={() => handleMoveSource(source, 'High')} disabled={isOperationInProgress || anyOperationGloballyInProgress}><ChevronsRight className="mr-2 h-4 w-4" />To High</Button>}
        </CardFooter>
      </Card>
    );
  };
  
  const renderKnowledgeBaseLevel = (level: KnowledgeBaseLevel) => {
    const config = LEVEL_CONFIG[level];
    const levelSources = sources[level];
    const levelIsLoading = isLoading[level];
    return (
        <AccordionItem value={level.toLowerCase()} key={level}>
          <AccordionTrigger className="text-xl font-headline">
            {config.title} ({levelSources.length})
          </AccordionTrigger>
          <AccordionContent>
             <CardDescription className="mb-4">{config.description}</CardDescription>
             {levelIsLoading ? (
                 <div className="flex justify-center items-center h-24">
                   <Loader2 className="h-8 w-8 animate-spin text-primary" />
                 </div>
             ) : levelSources.length === 0 ? (
                 <div className="text-center py-8 text-muted-foreground">
                   <History size={40} className="mx-auto mb-2" />
                   <p>No sources found.</p>
                 </div>
             ) : (
                levelSources.map(renderSourceCard)
             )}
             {levelSources.length > 0 && (
                <div className="mt-6">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" disabled={anyOperationGloballyInProgress}>
                                <Trash2 className="mr-2 h-4 w-4" /> Delete All Sources in {level}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete all {levelSources.length} sources and their indexed data from the {level} knowledge base. This action is irreversible.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteAllByLevel(level)}>Yes, delete all</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}
          </AccordionContent>
        </AccordionItem>
    );
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline text-primary">Knowledge Base Management</h1>
        <p className="text-muted-foreground">
          Manage the documents and sources that form the AI&apos;s knowledge. Upload new content, move sources between priority levels, or remove them entirely.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">Upload New Source</CardTitle>
              <CardDescription>
                Add content to the knowledge base. Processable files (PDF, TXT, DOCX) will be chunked and written to Firestore for the Vector Search extension to index.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file-upload">File</Label>
                <Input id="file-upload" type="file" ref={fileInputRef} onChange={(e) => e.target.files && setSelectedFile(e.target.files[0])} suppressHydrationWarning />
              </div>
               <div className="space-y-2">
                  <Label>Topic</Label>
                  <Select value={selectedTopicForUpload} onValueChange={setSelectedTopicForUpload}>
                      <SelectTrigger><SelectValue placeholder="Select a topic..." /></SelectTrigger>
                      <SelectContent>
                        {availableTopics.filter(t => t !== 'Diagnostics').length > 0 ? (
                           availableTopics.filter(t => t !== 'Diagnostics').map(topic => <SelectItem key={topic} value={topic}>{topic}</SelectItem>)
                        ) : (
                           <SelectItem value="General" disabled>No topics configured</SelectItem>
                        )}
                      </SelectContent>
                  </Select>
               </div>
               <div className="space-y-2">
                  <Label>Priority Level</Label>
                  <Select value={selectedLevelForUpload} onValueChange={(value) => setSelectedLevelForUpload(value as KnowledgeBaseLevel)}>
                      <SelectTrigger><SelectValue placeholder="Select a priority level..." /></SelectTrigger>
                      <SelectContent>
                         <SelectItem value="High">High Priority</SelectItem>
                         <SelectItem value="Medium">Medium Priority</SelectItem>
                         <SelectItem value="Low">Low Priority</SelectItem>
                      </SelectContent>
                  </Select>
               </div>
              <div className="space-y-2">
                <Label htmlFor="upload-description">Description</Label>
                <Textarea id="uploadDescription" value={uploadDescription} onChange={(e) => setUploadDescription(e.target.value)} placeholder="Briefly describe the source content..." suppressHydrationWarning />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleFileUpload} disabled={!selectedFile || anyOperationGloballyInProgress || !selectedTopicForUpload}>
                {isCurrentlyUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                Upload and Process
              </Button>
            </CardFooter>
          </Card>
          
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="diagnostics">
              <AccordionTrigger className="text-xl font-headline flex items-center gap-2">
                <Wrench /> Diagnostics
              </AccordionTrigger>
              <AccordionContent>
                <KnowledgeBaseDiagnostics
                  handleUpload={handleUpload}
                  isAnyOperationInProgress={anyOperationGloballyInProgress}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        <div className="lg:col-span-2">
          <Accordion type="single" collapsible className="w-full" value={activeAccordionItem} onValueChange={setActiveAccordionItem}>
            {renderKnowledgeBaseLevel('High')}
            {renderKnowledgeBaseLevel('Medium')}
            {renderKnowledgeBaseLevel('Low')}
            {renderKnowledgeBaseLevel('Archive')}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
