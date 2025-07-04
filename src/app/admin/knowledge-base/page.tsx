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
import { extractTextFromDocumentUrl, type ExtractTextFromDocumentUrlInput, type ExtractTextFromDocumentUrlOutput } from '@/ai/flows/extract-text-from-document-url-flow';
import { indexDocument, type IndexDocumentInput } from '@/ai/flows/index-document-flow';
import { Loader2, UploadCloud, Trash2, ShieldAlert, FileText, CheckCircle, AlertTriangle, ChevronRight, ChevronsRight, ChevronsLeft, History, Archive, RotateCcw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';

type KnowledgeBaseLevel = 'High' | 'Medium' | 'Low' | 'Archive';

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
          const topicsString = data.conversationalTopics || '';
          const topicsArray = topicsString.split(',').map((t: string) => t.trim()).filter((t: string) => t);
          setAvailableTopics(topicsArray);
          if (topicsArray.length > 0) {
            setSelectedTopicForUpload(topicsArray[0]);
          }
        }
      } catch (error) {
        console.error("Error fetching topics:", error);
      }
    };
    fetchTopics();
  }, []);

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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUpload = useCallback(async (fileToUpload: File, targetLevel: KnowledgeBaseLevel, topic: string, description: string) => {
    if (!fileToUpload) throw new Error("No file was provided to the upload handler.");

    const sourceId = uuidv4();
    setOperationStatus(sourceId, true);
    setIsCurrentlyUploading(true);
    
    const placeholderDocRef = doc(db, LEVEL_CONFIG[targetLevel].collectionName, sourceId);
    const storagePath = `knowledge_base_files/${targetLevel}/${sourceId}-${fileToUpload.name}`;
    const storageRef = ref(storage, storagePath);
    
    const placeholderData: KnowledgeSource = {
        id: sourceId,
        sourceName: fileToUpload.name,
        description,
        topic,
        level: targetLevel,
        createdAt: new Date().toISOString(),
        indexingStatus: 'processing',
    };
    await setDoc(placeholderDocRef, placeholderData);
    toast({ title: `Processing: ${fileToUpload.name}`, description: "File is being uploaded..." });
    
    let downloadURL: string;
    try {
        const uploadResult = await uploadBytes(storageRef, fileToUpload);
        downloadURL = await getDownloadURL(uploadResult.ref);
        await updateDoc(placeholderDocRef, { downloadURL });
    } catch (uploadError: any) {
        console.error("Storage upload error:", uploadError);
        toast({ title: "Upload Failed", description: `Could not upload ${fileToUpload.name} to storage.`, variant: "destructive" });
        await deleteDoc(placeholderDocRef).catch(e => console.error("Failed to cleanup placeholder doc after upload error:", e));
        setOperationStatus(sourceId, false);
        setIsCurrentlyUploading(false);
        return;
    }

    let extractedText: string;
    try {
        const isPlainText = fileToUpload.type === 'text/plain' || fileToUpload.name.toLowerCase().endsWith('.txt');
        const toastDescription = isPlainText ? "Reading text file directly..." : "Starting AI text extraction...";
        toast({ title: "Upload Successful", description: toastDescription, variant: "default" });

        if (isPlainText) {
            extractedText = await fileToUpload.text();
        } else {
            const extractionInput: ExtractTextFromDocumentUrlInput = { documentUrl: downloadURL, conversationalTopics: topic };
            const extractionResult: ExtractTextFromDocumentUrlOutput = await extractTextFromDocumentUrl(extractionInput);
            
            if (!extractionResult) {
                throw new Error('The text extraction process returned an empty response. This may indicate a network or API configuration issue.');
            }
            if (extractionResult.error || !extractionResult.extractedText) {
                throw new Error(extractionResult.error || 'Text extraction failed to return any content.');
            }
            extractedText = extractionResult.extractedText;
        }
    } catch (extractionError: any) {
        const errorMessage = extractionError.message || 'An unknown error occurred during text extraction.';
        console.error("Text extraction failed:", extractionError);
        toast({
            title: "Text Extraction Failed",
            description: `Could not read content from ${fileToUpload.name}. The uploaded file will be automatically removed. Error: ${errorMessage}`,
            variant: "destructive",
            duration: 10000
        });
        await deleteObject(storageRef).catch(e => console.error("Failed to cleanup storage file after extraction error:", e));
        await deleteDoc(placeholderDocRef).catch(e => console.error("Failed to cleanup placeholder doc after extraction error:", e));
        setOperationStatus(sourceId, false);
        setIsCurrentlyUploading(false);
        return;
    }

    toast({ title: "Text Ready", description: "Content is ready. Now indexing for RAG pipeline...", variant: "default" });

    const indexingInput: IndexDocumentInput = {
        sourceId: sourceId,
        sourceName: fileToUpload.name,
        text: extractedText,
        level: targetLevel,
        topic: topic,
        downloadURL: downloadURL,
    };

    const indexingResult = await indexDocument(indexingInput);

    if (!indexingResult.success) {
         toast({ title: "Indexing Failed", description: indexingResult.error, variant: "destructive", duration: 10000 });
    } else {
         toast({ title: "Indexing Successful", description: `${fileToUpload.name} has been added to the knowledge base.`, variant: "default" });
    }
    
    setOperationStatus(sourceId, false);
    setIsCurrentlyUploading(false);

  }, [toast]);

  const handleFileUpload = () => {
    if (!selectedFile || !selectedTopicForUpload) {
      toast({ title: "Missing Information", description: "Please select a file and a topic.", variant: "destructive" });
      return;
    }
    handleUpload(selectedFile, selectedLevelForUpload, uploadDescription);
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
            setOperationStatus(source.id, true);
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
    toast({ title: `Re-processing ${source.sourceName}...` });

    try {
        await updateDoc(doc(db, LEVEL_CONFIG[source.level].collectionName, source.id), {
            indexingStatus: 'processing',
            indexingError: '',
        });

        if (!source.downloadURL) {
            throw new Error("Source has no download URL, cannot re-process.");
        }
        
        const chunksQuery = query(collection(db, 'kb_chunks'), where('sourceId', '==', source.id));
        const chunksSnapshot = await getDocs(chunksQuery);
        if (!chunksSnapshot.empty) {
            const batch = writeBatch(db);
            chunksSnapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }

        let extractedText: string;
        
        const isPlainText = source.sourceName.toLowerCase().endsWith('.txt');
        const toastDescription = isPlainText ? "Reading text file directly..." : "Starting AI text extraction...";
        toast({ title: "Starting Text Extraction...", description: toastDescription });
        
        if (isPlainText) {
              const response = await fetch(source.downloadURL);
              if (!response.ok) throw new Error("Failed to fetch text file content for re-indexing.");
              extractedText = await response.text();
        } else {
              const extractionInput: ExtractTextFromDocumentUrlInput = { documentUrl: source.downloadURL, conversationalTopics: source.topic };
              const extractionResult: ExtractTextFromDocumentUrlOutput = await extractTextFromDocumentUrl(extractionInput);
              
              if (!extractionResult) {
                throw new Error('The text extraction process returned an empty response. This may indicate a network or API configuration issue.');
              }
              if (extractionResult.error || !extractionResult.extractedText) {
                throw new Error(extractionResult.error || 'Text extraction failed to return any content during re-indexing.');
              }
              extractedText = extractionResult.extractedText;
        }
        
        const indexingInput: IndexDocumentInput = {
            sourceId: source.id,
            sourceName: source.sourceName,
            text: extractedText,
            level: source.level,
            topic: source.topic,
            downloadURL: source.downloadURL,
        };

        const indexingResult = await indexDocument(indexingInput);

        if (!indexingResult.success) {
            if (indexingResult.error?.includes("automatically removed")) {
                 toast({ title: `Re-processing Aborted`, description: `Re-processing found no text in ${source.sourceName}, so it has been removed.`, variant: "destructive", duration: 10000 });
            } else {
                 toast({ title: "Re-indexing Failed", description: indexingResult.error, variant: "destructive", duration: 10000 });
            }
        } else {
            toast({ title: "Re-indexing Successful", description: `${source.sourceName} has been re-indexed.`, variant: "default" });
        }

    } catch (error: any) {
        const errorMessage = error.message || "An unknown error occurred during re-indexing.";
        toast({ title: `Error Re-indexing: ${source.sourceName}`, description: errorMessage, variant: "destructive", duration: 10000 });
        
        await updateDoc(doc(db, LEVEL_CONFIG[source.level].collectionName, source.id), {
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
                 <Button variant="outline" size="icon" title="Re-process source" onClick={() => handleReindexSource(source)} disabled={isOperationInProgress} className="text-primary hover:bg-primary/10">
                    <RotateCcw size={16} />
                </Button>
            )}
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="icon" disabled={isOperationInProgress}><Trash2 size={16} /></Button>
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
            {source.level !== 'Archive' && <Button size="sm" variant="outline" onClick={() => handleMoveSource(source, 'Archive')} disabled={isOperationInProgress}><Archive className="mr-2 h-4 w-4" />Archive</Button>}
            {source.level !== 'Low' && <Button size="sm" variant="outline" onClick={() => handleMoveSource(source, 'Low')} disabled={isOperationInProgress}><ChevronsLeft className="mr-2 h-4 w-4" />To Low</Button>}
            {source.level !== 'Medium' && <Button size="sm" variant="outline" onClick={() => handleMoveSource(source, 'Medium')} disabled={isOperationInProgress}><ChevronRight className="mr-2 h-4 w-4" />To Medium</Button>}
            {source.level !== 'High' && <Button size="sm" variant="outline" onClick={() => handleMoveSource(source, 'High')} disabled={isOperationInProgress}><ChevronsRight className="mr-2 h-4 w-4" />To High</Button>}
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
                <Input id="file-upload" type="file" ref={fileInputRef} onChange={handleFileChange} suppressHydrationWarning />
              </div>
               <div className="space-y-2">
                  <Label>Topic</Label>
                  <Select value={selectedTopicForUpload} onValueChange={setSelectedTopicForUpload}>
                      <SelectTrigger><SelectValue placeholder="Select a topic..." /></SelectTrigger>
                      <SelectContent>
                        {availableTopics.length > 0 ? (
                           availableTopics.map(topic => <SelectItem key={topic} value={topic}>{topic}</SelectItem>)
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
        <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2 text-destructive"><ShieldAlert /> Danger Zone</CardTitle>
              <CardDescription>
                This action will permanently delete all knowledge base sources and their indexed data from all tiers. This is irreversible.
              </CardDescription>
            </CardHeader>
            <CardFooter>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                       <Button variant="destructive" disabled={anyOperationGloballyInProgress}>Delete All Sources</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                       <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This will delete all sources from every tier (High, Medium, Low, and Archive). This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                       <AlertDialogFooter>
                           <AlertDialogCancel>Cancel</AlertDialogCancel>
                           <AlertDialogAction onClick={() => {
                                (Object.keys(LEVEL_CONFIG) as KnowledgeBaseLevel[]).forEach(handleDeleteAllByLevel);
                           }}>Yes, delete everything</AlertDialogAction>
                       </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardFooter>
        </Card>
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
