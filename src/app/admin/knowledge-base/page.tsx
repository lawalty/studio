
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UploadCloud, Trash2, FileText, FileAudio, FileImage, AlertCircle, FileType2, RefreshCw, Loader2, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


export interface KnowledgeSource {
  id: string;
  name: string;
  type: 'text' | 'pdf' | 'document' | 'audio' | 'image' | 'other';
  size: string;
  uploadedAt: string;
  storagePath: string;
  downloadURL: string;
}

type KnowledgeBaseLevel = 'High' | 'Medium' | 'Low';

const KB_CONFIG: Record<KnowledgeBaseLevel, { firestorePath: string; storageFolder: string; title: string }> = {
  High: {
    firestorePath: "configurations/kb_high_meta_v1",
    storageFolder: "knowledge_base_files_high_v1/",
    title: "High Priority Knowledge Base"
  },
  Medium: {
    firestorePath: "configurations/kb_medium_meta_v1",
    storageFolder: "knowledge_base_files_medium_v1/",
    title: "Medium Priority Knowledge Base"
  },
  Low: {
    firestorePath: "configurations/kb_low_meta_v1",
    storageFolder: "knowledge_base_files_low_v1/",
    title: "Low Priority Knowledge Base"
  }
};

const getFileIcon = (type: KnowledgeSource['type']) => {
  switch (type) {
    case 'pdf': return <FileText className="h-5 w-5 text-red-500" />;
    case 'text': return <FileText className="h-5 w-5 text-blue-500" />;
    case 'document': return <FileType2 className="h-5 w-5 text-sky-600" />;
    case 'audio': return <FileAudio className="h-5 w-5 text-purple-500" />;
    case 'image': return <FileImage className="h-5 w-5 text-green-500" />;
    default: return <FileText className="h-5 w-5 text-gray-500" />;
  }
};

export default function KnowledgeBasePage() {
  const [sourcesHigh, setSourcesHigh] = useState<KnowledgeSource[]>([]);
  const [sourcesMedium, setSourcesMedium] = useState<KnowledgeSource[]>([]);
  const [sourcesLow, setSourcesLow] = useState<KnowledgeSource[]>([]);

  const [isLoadingHigh, setIsLoadingHigh] = useState(true);
  const [isLoadingMedium, setIsLoadingMedium] = useState(true);
  const [isLoadingLow, setIsLoadingLow] = useState(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isCurrentlyUploading, setIsCurrentlyUploading] = useState(false);
  const [selectedKBTargetForUpload, setSelectedKBTargetForUpload] = useState<KnowledgeBaseLevel>('Medium');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const getSourcesSetter = (level: KnowledgeBaseLevel) => {
    if (level === 'High') return setSourcesHigh;
    if (level === 'Medium') return setSourcesMedium;
    return setSourcesLow;
  };

  const getIsLoadingSetter = (level: KnowledgeBaseLevel) => {
    if (level === 'High') return setIsLoadingHigh;
    if (level === 'Medium') return setIsLoadingMedium;
    return setIsLoadingLow;
  };
  
  const getSourcesState = (level: KnowledgeBaseLevel): KnowledgeSource[] => {
    if (level === 'High') return sourcesHigh;
    if (level === 'Medium') return sourcesMedium;
    return sourcesLow;
  };


  const saveSourcesToFirestore = useCallback(async (updatedSourcesToSave: KnowledgeSource[], level: KnowledgeBaseLevel): Promise<boolean> => {
    try {
      const config = KB_CONFIG[level];
      const sourcesForDb = updatedSourcesToSave.map(s => ({
        id: s.id, name: s.name, type: s.type, size: s.size,
        uploadedAt: s.uploadedAt, storagePath: s.storagePath, downloadURL: s.downloadURL,
      }));

      if (sourcesForDb.some(s => !s.id || !s.downloadURL || !s.storagePath)) {
        console.error(`[KBPage - saveSources - ${level}] Attempted to save sources with missing id, URL or Path. Aborting.`, sourcesForDb.filter(s=>!s.id || !s.downloadURL || !s.storagePath));
        toast({ title: "Internal Save Error", description: `Cannot save incomplete metadata for ${level} KB.`, variant: "destructive"});
        return false;
      }
      
      console.log(`[KBPage - saveSources - ${level}] Saving ${sourcesForDb.length} sources to Firestore. Path: ${config.firestorePath}`);
      const docRef = doc(db, config.firestorePath);
      await setDoc(docRef, { sources: sourcesForDb });
      console.log(`[KBPage - saveSources - ${level}] Successfully saved to Firestore.`);
      return true;
    } catch (error: any) {
      console.error(`[KBPage - saveSources - ${level}] Error saving to Firestore:`, error);
      toast({ title: "Firestore Save Error", description: `Failed to save ${level} KB: ${error.message || 'Unknown'}.`, variant: "destructive"});
      return false;
    }
  }, [toast]);


  const fetchSourcesForLevel = useCallback(async (level: KnowledgeBaseLevel) => {
    const setIsLoading = getIsLoadingSetter(level);
    const setSources = getSourcesSetter(level);
    const config = KB_CONFIG[level];

    setIsLoading(true);
    try {
      const docRef = doc(db, config.firestorePath);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data()?.sources) {
        setSources(docSnap.data().sources as KnowledgeSource[]);
      } else {
        setSources([]);
      }
    } catch (e: any) {
      console.error(`[KBPage - fetchSources - ${level}] Failed:`, e.message);
      toast({ title: `Error Loading ${level} KB`, description: `Could not fetch sources: ${e.message}.`, variant: "destructive" });
      setSources([]);
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchSourcesForLevel('High');
    fetchSourcesForLevel('Medium');
    fetchSourcesForLevel('Low');
  }, [fetchSourcesForLevel]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({ title: "No file selected", variant: "destructive" });
      return;
    }
    if (isCurrentlyUploading) {
      toast({ title: "Upload in Progress", variant: "default" });
      return;
    }

    setIsCurrentlyUploading(true);
    const currentFile = selectedFile;
    const targetLevel = selectedKBTargetForUpload;
    const config = KB_CONFIG[targetLevel];
    const setSources = getSourcesSetter(targetLevel);
    const currentSources = getSourcesState(targetLevel);

    const filePath = `${config.storageFolder}${Date.now()}-${currentFile.name.replace(/\s+/g, '_')}`;
    const fileRef = storageRef(storage, filePath);
    const permanentId = `firebase-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      toast({ title: "Upload Started", description: `Uploading ${currentFile.name} to ${targetLevel} KB...` });
      await uploadBytes(fileRef, currentFile);
      const downloadURL = await getDownloadURL(fileRef);

      if (!downloadURL) {
        console.error(`[KBPage - handleUpload - ${targetLevel}] CRITICAL: downloadURL is null for ${currentFile.name}.`);
        toast({ title: "URL Retrieval Failed", description: `Could not get URL for ${currentFile.name}. Metadata not saved.`, variant: "destructive"});
        setIsCurrentlyUploading(false);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      let fileType: KnowledgeSource['type'] = 'other';
      const mimeType = currentFile.type;
      if (mimeType.startsWith('audio/')) fileType = 'audio';
      else if (mimeType.startsWith('image/')) fileType = 'image';
      else if (mimeType === 'application/pdf') fileType = 'pdf';
      else if (mimeType.startsWith('text/plain') || currentFile.name.toLowerCase().endsWith('.txt')) fileType = 'text';
      else if (mimeType === 'application/msword' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') fileType = 'document';

      const newSource: KnowledgeSource = {
        id: permanentId, name: currentFile.name, type: fileType,
        size: `${(currentFile.size / (1024 * 1024)).toFixed(2)}MB`,
        uploadedAt: new Date().toISOString().split('T')[0],
        storagePath: filePath, downloadURL: downloadURL,
      };

      const newListForStateAndFirestore = [newSource, ...currentSources];
      setSources(newListForStateAndFirestore);

      const savedToDb = await saveSourcesToFirestore(newListForStateAndFirestore, targetLevel);
      if (savedToDb) {
        toast({ title: "Upload Successful", description: `${currentFile.name} saved to ${targetLevel} KB.` });
      } else {
        console.error(`[KBPage - handleUpload - ${targetLevel}] Firestore save failed. Reverting UI for item:`, permanentId);
        toast({ title: "Database Save Failed", description: `File uploaded but DB save failed for ${targetLevel} KB. Reverting.`, variant: "destructive"});
        setSources(prev => prev.filter(s => s.id !== permanentId));
      }
    } catch (error: any) {
      console.error(`[KBPage - handleUpload - ${targetLevel}] Upload/Save error:`, error);
      toast({ title: "Upload Failed", description: `Could not upload/save to ${targetLevel} KB: ${error.message || 'Unknown'}.`, variant: "destructive"});
      if (permanentId) setSources(prev => prev.filter(s => s.id !== permanentId));
    } finally {
      setIsCurrentlyUploading(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string, level: KnowledgeBaseLevel) => {
    const currentSources = getSourcesState(level);
    const setSources = getSourcesSetter(level);
    const sourceToDelete = currentSources.find(s => s.id === id);
    if (!sourceToDelete) return;

    const originalSources = [...currentSources];
    const updatedSourcesAfterDelete = currentSources.filter(source => source.id !== id);
    setSources(updatedSourcesAfterDelete);

    let dbUpdated = false;
    if (sourceToDelete.storagePath) {
      const fileRef = storageRef(storage, sourceToDelete.storagePath);
      try {
        await deleteObject(fileRef);
        dbUpdated = await saveSourcesToFirestore(updatedSourcesAfterDelete, level);
        if (dbUpdated) {
          toast({ title: "Source Removed", description: `${sourceToDelete.name} removed from ${level} KB and Storage.` });
        } else {
          setSources(originalSources); 
        }
      } catch (error) {
        console.error(`[KBPage - handleDelete - ${level}] Firebase deletion error:`, error);
        toast({ title: "Deletion Error", description: `Failed to remove ${sourceToDelete.name} from Storage for ${level} KB.`, variant: "destructive" });
        setSources(originalSources); 
      }
    } else { 
      dbUpdated = await saveSourcesToFirestore(updatedSourcesAfterDelete, level);
      if (dbUpdated) {
        toast({ title: "List Item Removed", description: `${sourceToDelete.name} removed from ${level} KB list.` });
      } else {
        setSources(originalSources); 
      }
    }
  };

  const handleRefreshSourceUrl = async (sourceId: string, level: KnowledgeBaseLevel) => {
    const currentSources = getSourcesState(level);
    const setSources = getSourcesSetter(level);
    const sourceToRefresh = currentSources.find(s => s.id === sourceId);

    if (!sourceToRefresh || !sourceToRefresh.storagePath) {
      toast({title: "Cannot Refresh", description: "Source missing storage path.", variant: "destructive"});
      return;
    }

    const originalSourcesSnapshot = [...currentSources]; 
    try {
      const fileRef = storageRef(storage, sourceToRefresh.storagePath);
      const newDownloadURL = await getDownloadURL(fileRef);

      if (!newDownloadURL) {
          console.error(`[KBPage - handleRefreshUrl - ${level}] CRITICAL: newDownloadURL is null for ${sourceToRefresh.name}.`);
          toast({ title: "URL Refresh Failed", description: `Could not get new URL for ${sourceToRefresh.name} in ${level} KB.`, variant: "destructive"});
          return;
      }
      
      const refreshedSourceItem: KnowledgeSource = { ...sourceToRefresh, downloadURL: newDownloadURL };
      const listWithRefreshedUrl = currentSources.map(s => s.id === sourceId ? refreshedSourceItem : s);
      setSources(listWithRefreshedUrl);

      const refreshedInDb = await saveSourcesToFirestore(listWithRefreshedUrl, level); 
      if(refreshedInDb) {
          toast({title: "URL Refreshed", description: `URL for ${sourceToRefresh.name} in ${level} KB updated.`});
      } else {
          console.error(`[KBPage - handleRefreshUrl - ${level}] Firestore save failed. Reverting UI.`);
          toast({title: "Refresh Save Error", description: "URL refreshed, but DB save failed. Reverting.", variant: "destructive"});
          setSources(originalSourcesSnapshot);
      }
    } catch (error) {
      console.error(`[KBPage - handleRefreshUrl - ${level}] Error refreshing URL:`, error);
      toast({title: "Refresh Failed", description: `Could not refresh URL for ${sourceToRefresh.name} in ${level} KB.`, variant: "destructive"});
      setSources(originalSourcesSnapshot); 
    }
  };

  const renderKnowledgeBaseSection = (level: KnowledgeBaseLevel) => {
    const sources = getSourcesState(level);
    const isLoadingSources = level === 'High' ? isLoadingHigh : (level === 'Medium' ? isLoadingMedium : isLoadingLow);
    const config = KB_CONFIG[level];

    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="font-headline">{config.title}</CardTitle>
          <CardDescription>View and remove sources. Uploaded files are in Firebase Storage (folder: {config.storageFolder}), metadata in Firestore (path: {config.firestorePath}).</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingSources ? (
             <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-border rounded-md">
                <RefreshCw className="h-12 w-12 text-muted-foreground mb-4 animate-spin" />
                <p className="text-muted-foreground">Loading {level} priority sources...</p>
            </div>
          ) : sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-border rounded-md">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No sources found for {level} priority.</p>
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded At</TableHead>
                <TableHead>Status/Link</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>{getFileIcon(source.type)}</TableCell>
                  <TableCell className="font-medium">{source.name}</TableCell>
                  <TableCell className="capitalize">{source.type}</TableCell>
                  <TableCell>{source.size}</TableCell>
                  <TableCell>{source.uploadedAt}</TableCell>
                  <TableCell>
                    {source.downloadURL ? (
                      <div className="flex items-center gap-1">
                        <a href={source.downloadURL} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                          View File
                        </a>
                        <Button variant="ghost" size="sm" onClick={() => handleRefreshSourceUrl(source.id, level)} aria-label="Refresh URL" className="h-6 w-6 p-0">
                            <RefreshCw className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : source.storagePath ? (
                        <span className="text-xs text-yellow-600">Processing...</span>
                    ) : (
                        <span className="text-xs text-gray-500">Error or pending</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(source.id, level)} aria-label="Delete source" disabled={isCurrentlyUploading || isLoadingSources}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    );
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Upload New Source</CardTitle>
          <CardDescription>
            Add content to AI Blair's knowledge base. Select the priority level before uploading.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="file-upload" className="font-medium whitespace-nowrap">Step 1:</Label>
            <Input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
              disabled={isCurrentlyUploading || isLoadingHigh || isLoadingMedium || isLoadingLow}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isCurrentlyUploading || isLoadingHigh || isLoadingMedium || isLoadingLow} className="w-full sm:w-auto">
              <UploadCloud className="mr-2 h-4 w-4" /> Choose File
            </Button>
            {selectedFile && <span className="text-sm text-muted-foreground truncate">{selectedFile.name}</span>}
          </div>
           {selectedFile && (
            <p className="text-xs text-muted-foreground pl-12"> {/* Added padding to align with step 1 */}
              Selected: {selectedFile.name} ({(selectedFile.size / (1024*1024)).toFixed(2)} MB) - Type: {selectedFile.type || "unknown"}
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="font-medium whitespace-nowrap">Step 2:</Label>
              <Label className="font-medium">Select Knowledge Base Priority:</Label>
            </div>
            <RadioGroup
              value={selectedKBTargetForUpload}
              onValueChange={(value: string) => setSelectedKBTargetForUpload(value as KnowledgeBaseLevel)}
              className="flex flex-col sm:flex-row sm:space-x-4 pl-12" /* Added padding to align with step 2 */
            >
              {(['High', 'Medium', 'Low'] as KnowledgeBaseLevel[]).map(level => (
                <div key={level} className="flex items-center space-x-2">
                  <RadioGroupItem value={level} id={`r-${level.toLowerCase()}`} />
                  <Label htmlFor={`r-${level.toLowerCase()}`}>{level}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </CardContent>
        <CardFooter>
          <div className="flex items-center gap-2">
            <Label className="font-medium whitespace-nowrap">Step 3:</Label>
            <Button onClick={handleUpload} disabled={!selectedFile || isCurrentlyUploading || isLoadingHigh || isLoadingMedium || isLoadingLow}>
              {isCurrentlyUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              {isCurrentlyUploading ? 'Uploading...' : 'Upload to Selected KB'}
            </Button>
          </div>
        </CardFooter>
      </Card>

      <Accordion type="multiple" defaultValue={['high-kb', 'medium-kb', 'low-kb']} className="w-full">
        <AccordionItem value="high-kb">
          <AccordionTrigger className="text-xl font-semibold hover:no-underline">High Priority Knowledge Base</AccordionTrigger>
          <AccordionContent>
            {renderKnowledgeBaseSection('High')}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="medium-kb">
          <AccordionTrigger className="text-xl font-semibold hover:no-underline">Medium Priority Knowledge Base</AccordionTrigger>
          <AccordionContent>
            {renderKnowledgeBaseSection('Medium')}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="low-kb">
          <AccordionTrigger className="text-xl font-semibold hover:no-underline">Low Priority Knowledge Base</AccordionTrigger>
          <AccordionContent>
            {renderKnowledgeBaseSection('Low')}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
    
