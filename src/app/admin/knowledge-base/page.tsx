
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, storage } from '@/lib/firebase';
import { collection, onSnapshot, doc, getDoc, setDoc, writeBatch, query, where, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
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
import { Loader2, UploadCloud, Trash2, FileText, CheckCircle, AlertTriangle, History, Archive, RotateCcw, HelpCircle, ArrowLeftRight, Link as LinkIcon, Eye } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Link from 'next/link';

export type KnowledgeBaseLevel = 'High' | 'Medium' | 'Low' | 'Spanish PDFs' | 'Chat History' | 'Archive';

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
  linkedEnglishSourceId?: string;
  pageNumber?: number;
  title?: string;
  header?: string;
}

const LEVEL_CONFIG: Record<KnowledgeBaseLevel, { title: string; description: string }> = {
  'High': { title: 'High Priority', description: 'Manage high priority sources.' },
  'Medium': { title: 'Medium Priority', description: 'Manage medium priority sources.' },
  'Low': { title: 'Low Priority', description: 'Manage low priority sources.' },
  'Spanish PDFs': { title: 'Spanish Version of English Documents', description: 'Spanish versions of English documents. Searched only for Spanish-speaking users.' },
  'Chat History': { title: 'Chat History', description: 'Automatically archived and indexed conversations. The AI can search these.' },
  'Archive': { title: 'Archive', description: 'Archived sources are not used by the AI.' },
};

const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toUpperCase() || 'FILE';
};

const RenderKnowledgeBaseLevel = ({
    level,
    sources,
    isLoading,
    operationInProgress,
    anyOperationGloballyInProgress,
    handleDeleteSource,
    handleMoveSource,
    handleReindexSource,
}: {
    level: KnowledgeBaseLevel,
    sources: KnowledgeSource[],
    isLoading: boolean,
    operationInProgress: Record<string, boolean>,
    anyOperationGloballyInProgress: boolean,
    handleDeleteSource: (source: KnowledgeSource) => void,
    handleMoveSource: (source: KnowledgeSource, newLevel: KnowledgeBaseLevel) => void,
    handleReindexSource: (source: KnowledgeSource) => void,
}) => {
    const config = LEVEL_CONFIG[level];
    const filteredSources = sources.filter(s => s.level === level);

    return (
        <AccordionItem value={level.toLowerCase().replace(/\s+/g, '-')} key={level}>
          <AccordionTrigger className="text-xl font-headline justify-start">
            {config.title} ({filteredSources.length})
          </AccordionTrigger>
          <AccordionContent>
             <CardDescription className="mb-4">{config.description}</CardDescription>
             {isLoading ? (
                 <div className="flex justify-center items-center h-24">
                   <Loader2 className="h-8 w-8 animate-spin text-primary" />
                 </div>
             ) : filteredSources.length === 0 ? (
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
                            {filteredSources.map(source => {
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
                                                            {(source.indexingStatus === 'processing' || source.indexingStatus === 'pending' || isOpInProgress) && <Loader2 size={16} className="animate-spin" />}
                                                            {source.indexingStatus === 'failed' && <AlertTriangle size={16} className="text-destructive" />}
                                                            <span className="capitalize">{isOpInProgress ? 'Processing' : source.indexingStatus}</span>
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
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                          {source.downloadURL ? (
                                                            <Button variant="ghost" size="icon" disabled={anyOperationGloballyInProgress} asChild>
                                                              <Link href={source.downloadURL} target="_blank">
                                                                <Eye size={16} />
                                                              </Link>
                                                            </Button>
                                                          ) : (
                                                            <Button variant="ghost" size="icon" disabled>
                                                              <Eye size={16} className="text-muted-foreground/50" />
                                                            </Button>
                                                          )}
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>View Original Document</p></TooltipContent>
                                                    </Tooltip>

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
                                                    
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="ghost" size="icon" onClick={() => handleReindexSource(source)} disabled={anyOperationGloballyInProgress}>
                                                                <RotateCcw size={16} className="text-primary" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>Re-process Source</p></TooltipContent>
                                                    </Tooltip>
                                                    
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

export default function KnowledgeBasePage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [englishSources, setEnglishSources] = useState<KnowledgeSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isCurrentlyUploading, setIsCurrentlyUploading] = useState(false);
  const [availableTopics, setAvailableTopics] = useState<string[]>([]);
  const [selectedTopicForUpload, setSelectedTopicForUpload] = useState<string>('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [selectedLevelForUpload, setSelectedLevelForUpload] = useState<KnowledgeBaseLevel>('High');
  const [linkedEnglishSourceIdForUpload, setLinkedEnglishSourceIdForUpload] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeAccordionItem, setActiveAccordionItem] = useState<string>('high-priority');
  const [operationInProgress, setOperationInProgress] = useState<Record<string, boolean>>({});
  
  const { toast } = useToast();

  const anyOperationGloballyInProgress = Object.values(operationInProgress).some(status => status);

  const setOperationStatus = useCallback((id: string, status: boolean) => {
    setOperationInProgress(prev => ({ ...prev, [id]: status }));
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
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
        console.error("Error fetching initial settings:", error);
      }
    };
    fetchSettings();
  }, [selectedTopicForUpload]);
  
  useEffect(() => {
    const q = query(collection(db, 'kb_meta'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const allSources: KnowledgeSource[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const createdAtDate = data.createdAt ? new Date(data.createdAt) : new Date();
        allSources.push({
          id: doc.id,
          sourceName: data.sourceName || 'Unknown Source',
          description: data.description || '',
          topic: data.topic || 'General',
          level: data.level || 'Archive',
          createdAt: createdAtDate.toLocaleString(),
          createdAtDate: createdAtDate,
          indexingStatus: data.indexingStatus || 'failed',
          indexingError: data.indexingError || 'No status available.',
          downloadURL: data.downloadURL,
          chunksWritten: data.chunksWritten,
          mimeType: data.mimeType,
          linkedEnglishSourceId: data.linkedEnglishSourceId,
          pageNumber: data.pageNumber,
          title: data.title,
          header: data.header,
        });
      });
      const sortedSources = allSources.sort((a,b) => b.createdAtDate.getTime() - a.createdAtDate.getTime());
      setSources(sortedSources);
      
      const english = sortedSources.filter(s => ['High', 'Medium', 'Low'].includes(s.level)).sort((a,b) => a.sourceName.localeCompare(b.sourceName));
      setEnglishSources(english);

      setIsLoading(false);
    }, (error) => {
      console.error(`Error fetching sources:`, error);
      setIsLoading(false);
    });

    return () => unsubscribe();
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
        console.error("[handleDeleteSource] Server returned an error:", result.error);
        toast({ title: "Deletion Failed", description: `${result.error}`, variant: "destructive", duration: 10000 });
      }
    } catch (error: any) {
      console.error("[handleDeleteSource] Caught exception:", error);
      toast({ title: "Client-side Error", description: `An unexpected error occurred: ${error.message}`, variant: "destructive", duration: 10000 });
    } finally {
      setOperationStatus(source.id, false);
    }
  }, [toast, setOperationStatus]);
  
  const handleReindexSource = useCallback(async (source: KnowledgeSource) => {
      setOperationStatus(source.id, true);
      const sourceDocRef = doc(db, 'kb_meta', source.id);
      
      try {
          await updateDoc(sourceDocRef, { indexingStatus: 'processing', indexingError: "Clearing old data...", chunksWritten: 0 });
  
          // Step 1: Delete existing chunks to prevent duplicates.
          const chunksCollectionRef = sourceDocRef.collection('kb_chunks');
          const chunksSnapshot = await getDocs(chunksCollectionRef);
          if (!chunksSnapshot.empty) {
              const batch = writeBatch(db);
              chunksSnapshot.docs.forEach(chunkDoc => {
                  batch.delete(chunkDoc.ref);
              });
              await batch.commit();
          }
  
          // Step 2: Proceed with the re-indexing flow.
          if (!source.downloadURL) {
              throw new Error("Source is missing a download URL, cannot re-process.");
          }
          
          await updateDoc(sourceDocRef, { indexingError: `Extracting text from ${source.mimeType || 'file'}...` });
          const extractionResult = await extractTextFromDocument({ documentUrl: source.downloadURL });
  
          if (!extractionResult || extractionResult.error || !extractionResult.extractedText || extractionResult.extractedText.trim() === '') {
              throw new Error(extractionResult?.error || 'Text extraction failed to produce any readable content. The document may be empty or an image-only PDF.');
          }
          
          await updateDoc(sourceDocRef, { indexingError: 'Re-indexing document chunks...' });
          const indexInput: Parameters<typeof indexDocument>[0] = {
              sourceId: source.id,
              sourceName: source.sourceName,
              text: extractionResult.extractedText,
              level: source.level,
              topic: source.topic,
              downloadURL: source.downloadURL,
              pageNumber: source.pageNumber,
              title: source.title,
              header: source.header,
          };
          if (source.linkedEnglishSourceId) {
              indexInput.linkedEnglishSourceId = source.linkedEnglishSourceId;
          }
  
          const indexingResult = await indexDocument(indexInput);
          
          if (!indexingResult.success || indexingResult.chunksWritten === 0) {
              throw new Error(indexingResult.error || "Indexing process failed to write any chunks to the database.");
          }
  
          toast({ title: "Success!", description: `"${source.sourceName}" has been successfully re-indexed with ${indexingResult.chunksWritten} chunks.` });
  
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
  }, [toast, setOperationStatus]);

  const handleFileUpload = async () => {
    if (!selectedFile || !selectedTopicForUpload || !selectedLevelForUpload) {
        toast({ title: "Missing Information", description: "Please select a file, topic, and priority level.", variant: "destructive" });
        return;
    }
    if (selectedLevelForUpload === 'Spanish PDFs' && !linkedEnglishSourceIdForUpload) {
        toast({ title: "Missing Information", description: "Please link the Spanish PDF to its English source document.", variant: "destructive" });
        return;
    }

    const sourceId = uuidv4();
    setOperationStatus(sourceId, true);
    setIsCurrentlyUploading(true);

    const fileToUpload = selectedFile;
    const targetLevel = selectedLevelForUpload;
    const topic = selectedTopicForUpload;
    const description = uploadDescription;
    const mimeType = fileToUpload.type || 'application/octet-stream';
    
    const sourceDocRef = doc(db, 'kb_meta', sourceId);

    try {
        const newSourceData: Partial<KnowledgeSource> & { createdAt: string } = {
            sourceName: fileToUpload.name, description,
            createdAt: new Date().toISOString(),
            indexingStatus: 'processing',
            indexingError: 'Uploading file to storage...',
            mimeType,
        };
        // For debugging, we are temporarily not writing these fields.
        // newSourceData.level = targetLevel;
        // newSourceData.topic = topic;

        if (targetLevel === 'Spanish PDFs' && linkedEnglishSourceIdForUpload) {
            newSourceData.linkedEnglishSourceId = linkedEnglishSourceIdForUpload;
        }
        await setDoc(sourceDocRef, newSourceData);

        const storagePath = `knowledge_base_files/${targetLevel}/${sourceId}-${fileToUpload.name}`;
        const fileRef = storageRef(storage, storagePath);
        await uploadBytes(fileRef, fileToUpload);

        const downloadURL = await getDownloadURL(fileRef);
        await updateDoc(sourceDocRef, { downloadURL, indexingError: 'Upload complete. Extracting text...' });
        
        const extractionResult = await extractTextFromDocument({ documentUrl: downloadURL });
        if (!extractionResult || extractionResult.error || !extractionResult.extractedText || extractionResult.extractedText.trim() === '') {
            throw new Error(extractionResult?.error || 'Text extraction failed to produce readable content. The document may be empty or an image-only PDF.');
        }

        const indexInput: Parameters<typeof indexDocument>[0] = {
            sourceId,
            sourceName: fileToUpload.name,
            text: extractionResult.extractedText,
            level: targetLevel,
            topic,
            downloadURL
        };
        if (targetLevel === 'Spanish PDFs' && linkedEnglishSourceIdForUpload) {
            indexInput.linkedEnglishSourceId = linkedEnglishSourceIdForUpload;
        }
        const indexingResult = await indexDocument(indexInput);

        if (!indexingResult.success || indexingResult.chunksWritten === 0) {
            throw new Error(indexingResult.error || "Indexing process failed to write any chunks to the database. The document may be empty.");
        }
        
        toast({ title: "Success!", description: `"${fileToUpload.name}" has been fully processed and indexed with ${indexingResult.chunksWritten} chunks.` });
        
        setSelectedFile(null);
        setUploadDescription('');
        setLinkedEnglishSourceIdForUpload('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }

    } catch (e: any) {
        const errorMessage = e.message || 'An unknown error occurred.';
        console.error(`[handleUpload] Error for ${fileToUpload.name}:`, e);
        toast({ title: "Processing Failed", description: errorMessage, variant: "destructive", duration: 10000 });

        if (sourceDocRef) {
            try {
                await updateDoc(sourceDocRef, {
                    indexingStatus: 'failed',
                    indexingError: errorMessage,
                });
            } catch (updateError) {
                console.error("Critical: Failed to write final failure status to Firestore.", updateError);
            }
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
          const oldDocRef = doc(db, 'kb_meta', source.id);
          const docSnap = await getDoc(oldDocRef);

          if (!docSnap.exists()) {
            throw new Error("Original source document not found to move.");
          }
          
          const docRef = doc(db, 'kb_meta', source.id);
          await updateDoc(docRef, { level: newLevel });

          const chunksCollectionRef = oldDocRef.collection('kb_chunks');
          const chunksSnapshot = await getDocs(chunksCollectionRef);

          if (!chunksSnapshot.empty) {
            const writeBatchForMove = writeBatch(db);
            chunksSnapshot.forEach(chunkDoc => {
                writeBatchForMove.update(chunkDoc.ref, { level: newLevel });
            });
            await writeBatchForMove.commit();
          }

          toast({ title: "Move Successful", description: `${source.sourceName} moved to ${newLevel}.`, variant: "default" });

      } catch (error: any) {
          console.error("Error moving source:", error);
          toast({ title: "Move Failed", description: `Could not move ${source.sourceName}. ${error.message}`, variant: "destructive" });
      } finally {
          setOperationStatus(source.id, false);
      }
  }, [toast, setOperationStatus]);
  
  return (
    <div className="container mx-auto p-4 md:p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline text-primary">Knowledge Base Management</h1>
        <p className="text-muted-foreground">
          Manage the documents and sources that form the AI's knowledge. Upload new content, move sources between priority levels, or remove them entirely.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">Upload New Source</CardTitle>
              <CardDescription>
                Add a new source to the knowledge base. The file will be automatically processed and indexed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file-upload">File</Label>
                <Input id="file-upload" type="file" ref={fileInputRef} onChange={(e) => e.target.files && setSelectedFile(e.target.files[0])} />
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
                         <SelectItem value="Spanish PDFs">Spanish PDFs</SelectItem>
                         <SelectItem value="Archive">Archive</SelectItem>
                      </SelectContent>
                  </Select>
               </div>
              {selectedLevelForUpload === 'Spanish PDFs' && (
                <div className="space-y-2">
                    <Label className="flex items-center gap-2"><LinkIcon className="h-4 w-4" /> Link to English Source</Label>
                    <Select value={linkedEnglishSourceIdForUpload} onValueChange={setLinkedEnglishSourceIdForUpload}>
                        <SelectTrigger><SelectValue placeholder="Select the English version..." /></SelectTrigger>
                        <SelectContent>
                            {englishSources.length > 0 ? (
                                englishSources.map(source => <SelectItem key={source.id} value={source.id}>{source.sourceName}</SelectItem>)
                            ) : (
                                <SelectItem value="" disabled>No English PDFs found</SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="upload-description">Description (Optional)</Label>
                <Textarea id="uploadDescription" value={uploadDescription} onChange={(e) => setUploadDescription(e.target.value)} placeholder="Briefly describe the source content..." />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleFileUpload} disabled={!selectedFile || anyOperationGloballyInProgress || !selectedTopicForUpload || isCurrentlyUploading}>
                {isCurrentlyUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                Upload and Process
              </Button>
            </CardFooter>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Accordion type="single" collapsible className="w-full" value={activeAccordionItem} onValueChange={(value) => setActiveAccordionItem(value || '')}>
            {Object.keys(LEVEL_CONFIG).map((level) => (
                <RenderKnowledgeBaseLevel
                    key={level}
                    level={level as KnowledgeBaseLevel}
                    sources={sources}
                    isLoading={isLoading}
                    operationInProgress={operationInProgress}
                    anyOperationGloballyInProgress={anyOperationGloballyInProgress}
                    handleDeleteSource={handleDeleteSource}
                    handleMoveSource={handleMoveSource}
                    handleReindexSource={handleReindexSource}
                />
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
