
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, storage } from '@/lib/firebase';
import { collection, onSnapshot, doc, getDoc, setDoc, writeBatch, query, where, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from 'uuid';
import { extractTextFromDocument } from '@/ai/flows/extract-text-from-document-url-flow';
import { indexDocument } from '@/ai/flows/index-document-flow';
import { deleteSource } from '@/ai/flows/delete-source-flow';
import { Loader2, UploadCloud, Trash2, FileText, CheckCircle, AlertTriangle, History, Archive, RotateCcw, Wrench, HelpCircle, ArrowLeftRight, RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import KnowledgeBaseDiagnostics from '@/components/admin/KnowledgeBaseDiagnostics';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';


export type KnowledgeBaseLevel = 'High' | 'Medium' | 'Low' | 'Archive';

interface KnowledgeSource {
  id: string;
  sourceName: string;
  description: string;
  topic: string;
  level: KnowledgeBaseLevel;
  createdAt: string;
  createdAtDate: Date;
  indexingStatus: 'pending' | 'processing' | 'success' | 'failed';
  indexingError?: string;
  downloadURL?: string;
  chunksWritten?: number;
  mimeType?: string;
}

const LEVEL_CONFIG: Record<KnowledgeBaseLevel, { collectionName: string; title: string; description: string }> = {
  'High': { collectionName: 'kb_high_meta_v1', title: 'High Priority', description: 'Manage high priority sources.' },
  'Medium': { collectionName: 'kb_medium_meta_v1', title: 'Medium Priority', description: 'Manage medium priority sources.' },
  'Low': { collectionName: 'kb_low_meta_v1', title: 'Low Priority', description: 'Manage low priority sources.' },
  'Archive': { collectionName: 'kb_archive_meta_v1', title: 'Archive', description: 'Archived sources are not used by the AI.' },
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
  const [activeAccordionItem, setActiveAccordionItem] = useState<string>('high');
  const [operationInProgress, setOperationInProgress] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

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
          let topicsArray = topicsString.split(',').map((t: string) => t.trim()).filter((t: string) => t);
          setAvailableTopics(topicsArray);
          if (topicsArray.length > 0 && !topicsArray.includes(selectedTopicForUpload)) {
            setSelectedTopicForUpload(topicsArray[0]);
          }
        }
      } catch (error) {
        console.error("Error fetching topics:", error);
      }
    };
    fetchTopics();
  }, [selectedTopicForUpload]);
  
  // This effect will listen for real-time updates on all knowledge base levels
  useEffect(() => {
    const unsubscribers = Object.entries(LEVEL_CONFIG).map(([level, config]) => {
      const q = query(collection(db, config.collectionName));
      return onSnapshot(q, (querySnapshot) => {
        const levelSources: KnowledgeSource[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const createdAtDate = data.createdAt ? new Date(data.createdAt) : new Date();
          levelSources.push({
            id: doc.id,
            sourceName: data.sourceName || 'Unknown Source',
            description: data.description || '',
            topic: data.topic || 'General',
            level: level as KnowledgeBaseLevel,
            createdAt: createdAtDate.toLocaleString(),
            createdAtDate: createdAtDate,
            indexingStatus: data.indexingStatus || 'failed',
            indexingError: data.indexingError || 'No status available.',
            downloadURL: data.downloadURL,
            chunksWritten: data.chunksWritten,
            mimeType: data.mimeType,
          });
        });
        setSources(prevSources => ({ ...prevSources, [level as KnowledgeBaseLevel]: levelSources.sort((a,b) => b.createdAtDate.getTime() - a.createdAtDate.getTime()) }));
        setIsLoading(prevLoading => ({ ...prevLoading, [level as KnowledgeBaseLevel]: false }));
      }, (error) => {
        console.error(`Error fetching ${level} priority sources:`, error);
        setIsLoading(prevLoading => ({ ...prevLoading, [level as KnowledgeBaseLevel]: false }));
      });
    });

    return () => unsubscribers.forEach(unsub => unsub());
  }, []);

  const handleDeleteSource = useCallback(async (source: KnowledgeSource) => {
    setOperationStatus(source.id, true);
    toast({ title: `Deleting ${source.sourceName}...` });
    try {
      const result = await deleteSource({
        id: source.id,
        level: source.level,
        sourceName: source.sourceName,
      });

      if (result.success) {
        toast({ title: "Deletion Successful", description: `${source.sourceName} has been completely removed.`, variant: "default" });
      } else {
        throw new Error(result.error || "An unknown error occurred during deletion.");
      }

    } catch (error: any) {
      console.error("Error deleting source:", error);
      toast({ title: "Deletion Failed", description: `Could not delete ${source.sourceName}. ${error.message}`, variant: "destructive", duration: 10000 });
    } finally {
      setOperationStatus(source.id, false);
    }
  }, [toast]);
  
  const handleReindexSource = useCallback(async (source: KnowledgeSource) => {
    setOperationStatus(source.id, true);
    toast({ title: `Re-processing ${source.sourceName}...` });

    const sourceDocRef = doc(db, LEVEL_CONFIG[source.level].collectionName, source.id);
    await updateDoc(sourceDocRef, { indexingStatus: 'processing', indexingError: "Starting re-processing...", chunksWritten: 0 });

    try {
        if (!source.downloadURL) {
            throw new Error("Source is missing a download URL, cannot re-process.");
        }
        
        await updateDoc(sourceDocRef, { indexingError: `Extracting text from ${source.mimeType || 'file'}...` });
        const extractionResult = await extractTextFromDocument({ documentUrl: source.downloadURL });

        if (extractionResult.error || !extractionResult.extractedText || extractionResult.extractedText.trim() === '') {
            throw new Error(extractionResult.error || 'Text extraction failed to produce any readable content. The document may be empty or an image-only PDF.');
        }
        
        await updateDoc(sourceDocRef, { indexingError: 'Re-indexing document chunks...' });
        const indexingResult = await indexDocument({
            sourceId: source.id,
            sourceName: source.sourceName,
            text: extractionResult.extractedText,
            level: source.level,
            topic: source.topic,
            downloadURL: source.downloadURL,
        });
        
        if (!indexingResult.success || indexingResult.chunksWritten === 0) {
            throw new Error(indexingResult.error || "Indexing process failed to write any chunks to the database.");
        }

        toast({ title: "Success!", description: `"${source.sourceName}" has been successfully re-indexed.` });

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

  
  const handleFileUpload = async () => {
    if (!selectedFile || !selectedTopicForUpload) {
        toast({ title: "Missing Information", description: "Please select a file and a topic.", variant: "destructive" });
        return;
    }

    const fileToUpload = selectedFile;
    const targetLevel = selectedLevelForUpload;
    const topic = selectedTopicForUpload;
    const description = uploadDescription;
    const sourceId = uuidv4();
    const mimeType = fileToUpload.type || 'application/octet-stream';

    setIsCurrentlyUploading(true);
    setOperationStatus(sourceId, true);

    const collectionName = LEVEL_CONFIG[targetLevel].collectionName;
    const sourceDocRef = doc(db, collectionName, sourceId);

    try {
        toast({ title: "Uploading File...", description: `Preparing "${fileToUpload.name}".` });

        // Step 1: Create initial placeholder metadata in Firestore
        const newSourceData = {
            sourceName: fileToUpload.name, description, topic, level: targetLevel,
            createdAt: new Date().toISOString(),
            indexingStatus: 'processing',
            indexingError: 'Waiting for upload...',
            mimeType,
        };
        await setDoc(sourceDocRef, newSourceData);

        // Step 2: Upload file to Cloud Storage
        await updateDoc(sourceDocRef, { indexingError: 'Uploading to cloud storage...' });
        const storagePath = `knowledge_base_files/${targetLevel}/${sourceId}-${fileToUpload.name}`;
        const fileRef = storageRef(storage, storagePath);
        await uploadBytes(fileRef, fileToUpload);
        const downloadURL = await getDownloadURL(fileRef);

        // Update doc with download URL
        await updateDoc(sourceDocRef, { downloadURL, indexingError: 'Upload complete. Starting text extraction...' });

        // Step 3: Extract text from the now-uploaded file
        const extractionResult = await extractTextFromDocument({ documentUrl: downloadURL });
        if (extractionResult.error || !extractionResult.extractedText || extractionResult.extractedText.trim() === '') {
            throw new Error(extractionResult.error || 'Text extraction failed to produce any readable content. The document may be empty or an image-only PDF.');
        }

        // Step 4: Call the indexing flow
        await updateDoc(sourceDocRef, { indexingError: 'Indexing content (embeddings)...' });
        const indexingResult = await indexDocument({
            sourceId,
            sourceName: fileToUpload.name,
            text: extractionResult.extractedText,
            level: targetLevel,
            topic,
            downloadURL
        });

        // Step 5: Final Validation
        if (!indexingResult.success || indexingResult.chunksWritten === 0) {
            throw new Error(indexingResult.error || "Indexing process failed to write any chunks to the database. The document may be empty.");
        }
        
        // Final success toast
        toast({ title: "Success!", description: `"${fileToUpload.name}" has been fully processed and indexed.` });

        // Reset form on full success
        setSelectedFile(null);
        setUploadDescription('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }

    } catch (e: any) {
        const errorMessage = `Processing Failed: ${e.message || 'Unknown error.'}`;
        console.error(`[handleUpload] Error for ${fileToUpload.name}:`, e);
        toast({ title: "Processing Failed", description: errorMessage, variant: "destructive", duration: 10000 });
        
        try {
            // Update Firestore with the specific failure message
            await updateDoc(sourceDocRef, {
                indexingStatus: 'failed',
                indexingError: errorMessage,
            });
        } catch (updateError) {
            console.error("Critical: Failed to write final failure status to Firestore.", updateError);
        }
    } finally {
        setIsCurrentlyUploading(false);
        setOperationStatus(sourceId, false);
    }
  };


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
  }, [toast]);

  const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toUpperCase() || 'FILE';
  };
  
  const renderKnowledgeBaseLevel = (level: KnowledgeBaseLevel) => {
    const config = LEVEL_CONFIG[level];
    const levelSources = sources[level];
    const levelIsLoading = isLoading[level];
    
    return (
        <AccordionItem value={level.toLowerCase()} key={level}>
          <AccordionTrigger className="text-xl font-headline">
            {config.title} Knowledge Base ({levelSources.length})
          </AccordionTrigger>
          <AccordionContent>
             <CardDescription className="mb-4">{config.description}</CardDescription>
             {levelIsLoading ? (
                 <div className="flex justify-center items-center h-24">
                   <Loader2 className="h-8 w-8 animate-spin text-primary" />
                 </div>
             ) : levelSources.length === 0 ? (
                 <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                   <History size={40} className="mx-auto mb-2" />
                   <p>No sources found in this knowledge base.</p>
                 </div>
             ) : (
                <ScrollArea className="h-[450px] w-full rounded-md border">
                    <Table>
                        <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur-sm">
                            <TableRow>
                                <TableHead className="w-[40%]">Name</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Topic</TableHead>
                                <TableHead>Added</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {levelSources.map(source => {
                                const isOpInProgress = operationInProgress[source.id] || false;
                                return (
                                    <TableRow key={source.id} className={cn(isOpInProgress && "opacity-50 pointer-events-none")}>
                                        <TableCell className="font-medium">
                                          <div className="flex items-center gap-2">
                                            <FileText size={16} className="text-muted-foreground" />
                                            <div className="flex flex-col">
                                                <span className="truncate" title={source.sourceName}>{source.sourceName}</span>
                                                <span className="text-xs text-muted-foreground">{getFileExtension(source.sourceName)}</span>
                                            </div>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                            <TooltipProvider>
                                                <Tooltip delayDuration={300}>
                                                    <TooltipTrigger>
                                                        <div className="flex items-center gap-2">
                                                            {source.indexingStatus === 'success' && <CheckCircle size={16} className="text-green-500" />}
                                                            {(source.indexingStatus === 'processing' || source.indexingStatus === 'pending') && <Loader2 size={16} className="animate-spin" />}
                                                            {source.indexingStatus === 'failed' && <AlertTriangle size={16} className="text-destructive" />}
                                                            <span className="capitalize">{source.indexingStatus}</span>
                                                        </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        {source.indexingStatus === 'success' && <p>{source.chunksWritten ?? 0} chunks written.</p>}
                                                        {source.indexingStatus === 'failed' && <p>Error: {source.indexingError}</p>}
                                                        {source.indexingStatus === 'processing' && <p>{source.indexingError || 'File is being processed...'}</p>}
                                                        {source.indexingStatus === 'pending' && <p>Waiting for server to start processing.</p>}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </TableCell>
                                        <TableCell>{source.topic}</TableCell>
                                        <TableCell>{source.createdAt}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <TooltipProvider>
                                                    <AlertDialog>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button variant="ghost" size="icon" disabled={!source.description || anyOperationGloballyInProgress}>
                                                                        <HelpCircle size={16} className={!source.description ? "text-muted-foreground/50" : ""} />
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                            </TooltipTrigger>
                                                            <TooltipContent><p>View Description</p></TooltipContent>
                                                        </Tooltip>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>{source.sourceName}</AlertDialogTitle>
                                                                <AlertDialogDescription className="max-h-[400px] overflow-y-auto">
                                                                    {source.description || "No description was provided for this source."}
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter><AlertDialogAction>Close</AlertDialogAction></AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                    
                                                    <DropdownMenu>
                                                      <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" disabled={anyOperationGloballyInProgress}>
                                                                    <ArrowLeftRight size={16} />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>Move To...</p></TooltipContent>
                                                      </Tooltip>
                                                      <DropdownMenuContent>
                                                          {Object.keys(LEVEL_CONFIG).filter(lvl => lvl !== source.level).map(lvl => (
                                                              <DropdownMenuItem key={lvl} onSelect={() => handleMoveSource(source, lvl as KnowledgeBaseLevel)}>
                                                                  {LEVEL_CONFIG[lvl as KnowledgeBaseLevel].title}
                                                              </DropdownMenuItem>
                                                          ))}
                                                      </DropdownMenuContent>
                                                    </DropdownMenu>
                                                    
                                                    {(source.indexingStatus === 'failed' || source.indexingStatus === 'success' ) && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button variant="ghost" size="icon" onClick={() => handleReindexSource(source)} disabled={anyOperationGloballyInProgress}>
                                                                    <RotateCcw size={16} className="text-primary" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent><p>Re-process Source</p></TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                    
                                                    <AlertDialog>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button variant="ghost" size="icon" disabled={anyOperationGloballyInProgress} className="text-destructive hover:text-destructive">
                                                                        <Trash2 size={16} />
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                            </TooltipTrigger>
                                                            <TooltipContent><p>Delete Source</p></TooltipContent>
                                                        </Tooltip>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                                <AlertDialogDescription>This will permanently delete the source and all its indexed data. This action cannot be undone.</AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDeleteSource(source)}>Delete</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </TooltipProvider>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </ScrollArea>
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
                Add a new source to the knowledge base. The file will be uploaded and processed by a server-side flow.
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
          
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="diagnostics">
              <AccordionTrigger className="text-xl font-headline flex items-center gap-2">
                <Wrench /> Diagnostics
              </AccordionTrigger>
              <AccordionContent>
                <KnowledgeBaseDiagnostics
                  isAnyOperationInProgress={anyOperationGloballyInProgress}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        <div className="lg:col-span-2">
          <Accordion type="single" collapsible className="w-full" value={activeAccordionItem} onValueChange={(value) => setActiveAccordionItem(value || '')}>
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
