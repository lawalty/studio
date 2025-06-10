
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UploadCloud, Trash2, FileText, FileAudio, FileImage, AlertCircle, FileType2, RefreshCw, Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, getDoc, setDoc } from 'firebase/firestore';
// Removed Progress import as per-item progress is removed

export interface KnowledgeSource {
  id: string;
  name: string;
  type: 'text' | 'pdf' | 'document' | 'audio' | 'image' | 'other';
  size: string;
  uploadedAt: string;
  storagePath: string;
  downloadURL: string;
  // Removed uploadProgress and isUploading
}

// KnowledgeSourceDraft is now effectively the same as KnowledgeSource if not simpler
// For now, let's assume KnowledgeSource is the primary type.

const FIRESTORE_KNOWLEDGE_SOURCES_PATH = "configurations/knowledge_base_v2_meta";

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
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [isCurrentlyUploading, setIsCurrentlyUploading] = useState(false); // New state for general upload progress
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const saveSourcesToFirestore = async (updatedSourcesToSave: KnowledgeSource[]): Promise<boolean> => {
    try {
      // Ensure only complete KnowledgeSource objects are saved
      const sourcesForDb = updatedSourcesToSave.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        size: s.size,
        uploadedAt: s.uploadedAt,
        storagePath: s.storagePath,
        downloadURL: s.downloadURL,
      }));

      if (sourcesForDb.some(s => !s.id || !s.downloadURL || !s.storagePath)) {
        console.error("[KnowledgeBasePage - saveSourcesToFirestore] Attempted to save sources with missing id, URL or Path. Aborting save.", sourcesForDb.filter(s=>!s.id || !s.downloadURL || !s.storagePath));
        toast({
            title: "Internal Save Error",
            description: "Attempted to save incomplete source metadata (missing ID, URL, or Path). Please report this.",
            variant: "destructive",
            duration: 7000
        });
        return false;
      }
      
      console.log(`[KnowledgeBasePage - saveSourcesToFirestore] Attempting to save ${sourcesForDb.length} sources to Firestore. Document path: ${FIRESTORE_KNOWLEDGE_SOURCES_PATH}`, JSON.stringify(sourcesForDb, null, 2));
      
      const docRef = doc(db, FIRESTORE_KNOWLEDGE_SOURCES_PATH);
      await setDoc(docRef, { sources: sourcesForDb });
      console.log(`[KnowledgeBasePage - saveSourcesToFirestore] Successfully saved ${sourcesForDb.length} sources to Firestore.`);
      return true;
    } catch (error: any) {
      console.error("[KnowledgeBasePage - saveSourcesToFirestore] Error saving sources to Firestore:", error.message, error.code, error.stack, error);
      toast({
        title: "Firestore Save Error",
        description: `Failed to save knowledge base to database: ${error.message || 'Unknown error'}. Data may be out of sync.`,
        variant: "destructive",
        duration: 7000
      });
      return false;
    }
  };

  useEffect(() => {
    const fetchSources = async () => {
      setIsLoadingSources(true);
      try {
        const docRef = doc(db, FIRESTORE_KNOWLEDGE_SOURCES_PATH);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data()?.sources) {
          setSources(docSnap.data().sources as KnowledgeSource[]);
        } else {
          setSources([]);
        }
      } catch (e: any) {
        console.error("[KnowledgeBasePage - fetchSources] Failed to fetch sources from Firestore", e.message, e);
        toast({ title: "Error Loading Sources", description: `Could not fetch knowledge sources: ${e.message}. Please try again.`, variant: "destructive" });
        setSources([]);
      }
      setIsLoadingSources(false);
    };
    fetchSources();
  }, [toast]); // Keep toast if needed for its identity, or empty array if not critical.


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({ title: "No file selected", description: "Please select a file to upload.", variant: "destructive" });
      return;
    }
    if (isCurrentlyUploading) {
      toast({ title: "Upload in Progress", description: "Please wait for the current upload to complete.", variant: "default" });
      return;
    }

    setIsCurrentlyUploading(true);
    const currentFile = selectedFile;
    // tempId is no longer needed for draft UI items

    const filePath = `knowledge_base_files_v2/${Date.now()}-${currentFile.name.replace(/\s+/g, '_')}`;
    const fileRef = storageRef(storage, filePath);
    let finalNewSource: KnowledgeSource | null = null;

    try {
      toast({ title: "Upload Started", description: `Uploading ${currentFile.name}...` });
      
      await uploadBytes(fileRef, currentFile);
      const downloadURL = await getDownloadURL(fileRef);
      console.log(`[KnowledgeBasePage - handleUpload] Retrieved downloadURL: ${downloadURL} for filePath: ${filePath}`);

      if (!downloadURL) {
        console.error(`[KnowledgeBasePage - handleUpload] CRITICAL: downloadURL is null or undefined for ${currentFile.name} after getDownloadURL.`);
        toast({
          title: "URL Retrieval Failed",
          description: `Could not get download URL for ${currentFile.name}. Upload metadata not saved. Check Storage permissions or object status.`,
          variant: "destructive",
          duration: 9000,
        });
        // No draft item to remove from `sources` state here
        setIsCurrentlyUploading(false);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      let fileType: KnowledgeSource['type'] = 'other';
      const mimeType = currentFile.type;
      const fileNameLower = currentFile.name.toLowerCase();
      if (mimeType.startsWith('audio/')) fileType = 'audio';
      else if (mimeType.startsWith('image/')) fileType = 'image';
      else if (mimeType === 'application/pdf') fileType = 'pdf';
      else if (mimeType.startsWith('text/plain') || fileNameLower.endsWith('.txt')) fileType = 'text';
      else if (mimeType === 'application/msword' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileNameLower.endsWith('.doc') || fileNameLower.endsWith('.docx')) fileType = 'document';

      const permanentId = `firebase-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      finalNewSource = {
        id: permanentId,
        name: currentFile.name,
        type: fileType,
        size: `${(currentFile.size / (1024 * 1024)).toFixed(2)}MB`,
        uploadedAt: new Date().toISOString().split('T')[0],
        storagePath: filePath,
        downloadURL: downloadURL,
      };
      console.log("[KnowledgeBasePage - handleUpload] finalNewSource created:", JSON.stringify(finalNewSource, null, 2));

      let capturedListForFirestore: KnowledgeSource[] = [];
      setSources(prevSources => {
        const newList = [finalNewSource!, ...prevSources]; // Add the new final source to the beginning
        capturedListForFirestore = newList;
        return newList;
      });

      await new Promise(resolve => setTimeout(resolve, 0)); // Micro-delay
      console.log(`[KnowledgeBasePage - handleUpload] capturedListForFirestore after micro-delay: ${capturedListForFirestore.length} items. First item ID (if any): ${capturedListForFirestore[0]?.id}`);

      if (capturedListForFirestore.length > 0 && capturedListForFirestore.some(s => s.id === permanentId)) {
        const savedToDb = await saveSourcesToFirestore(capturedListForFirestore);
        if (savedToDb) {
          toast({ title: "Upload Successful", description: `${currentFile.name} has been uploaded and saved to the database.` });
        }
        // saveSourcesToFirestore handles its own error toast if !savedToDb
      } else {
        console.error("[KnowledgeBasePage - handleUpload] capturedListForFirestore was empty or did not contain the new item. This is unexpected. finalNewSource:", JSON.stringify(finalNewSource, null, 2));
        toast({ title: "State Error", description: "Could not prepare data for saving after upload (list empty or item missing). Please report this.", variant: "destructive" });
        // Attempt to revert state if possible, by removing the item if it was added but not saved
        if (finalNewSource) {
            setSources(prev => prev.filter(s => s.id !== finalNewSource!.id));
        }
      }
    } catch (error: any) {
      console.error("[KnowledgeBasePage - handleUpload] Upload or Save error:", error);
      let description = `Could not upload or save ${currentFile.name}.`;
      if (error.code) description += ` (Error: ${error.code})`;
      else if (error.message) description += ` (Message: ${error.message})`;
      toast({ title: "Upload Failed", description, variant: "destructive", duration: 7000 });
      // If finalNewSource was created and added to state, try to remove it
      if (finalNewSource) {
        setSources(prev => prev.filter(s => s.id !== finalNewSource!.id));
      }
    } finally {
      setIsCurrentlyUploading(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    const sourceToDelete = sources.find(s => s.id === id);
    if (!sourceToDelete) return;

    const originalSources = [...sources];
    const updatedSourcesAfterDelete = sources.filter(source => source.id !== id);
    setSources(updatedSourcesAfterDelete);

    let dbUpdated = false;
    if (sourceToDelete.storagePath) {
      const fileRef = storageRef(storage, sourceToDelete.storagePath);
      try {
        await deleteObject(fileRef);
        dbUpdated = await saveSourcesToFirestore(updatedSourcesAfterDelete);
        if (dbUpdated) {
          toast({ title: "Source Removed", description: `${sourceToDelete.name} has been removed from Firebase and the list.` });
        } else {
          setSources(originalSources);
        }
      } catch (error) {
        console.error("[KnowledgeBasePage - handleDelete] Firebase deletion error:", error);
        toast({ title: "Deletion Error", description: `Failed to remove ${sourceToDelete.name} from Firebase Storage. Database may be out of sync.`, variant: "destructive" });
        setSources(originalSources);
      }
    } else {
      // If no storagePath, it's an item that somehow only exists in the list, update Firestore
      dbUpdated = await saveSourcesToFirestore(updatedSourcesAfterDelete);
      if (dbUpdated) {
        toast({ title: "List Item Removed", description: `${sourceToDelete.name} has been removed from the list.` });
      } else {
        setSources(originalSources);
      }
    }
  };

  const handleRefreshSourceUrl = async (sourceId: string) => {
    const sourceToRefresh = sources.find(s => s.id === sourceId);
    if (!sourceToRefresh || !sourceToRefresh.storagePath) {
      toast({title: "Cannot Refresh", description: "Source does not have a valid storage path.", variant: "destructive"});
      return;
    }

    let refreshedSourceItem: KnowledgeSource | null = null;

    try {
      const fileRef = storageRef(storage, sourceToRefresh.storagePath);
      const newDownloadURL = await getDownloadURL(fileRef);

      if (!newDownloadURL) {
          console.error(`[KnowledgeBasePage - handleRefreshSourceUrl] CRITICAL: newDownloadURL is null or undefined for ${sourceToRefresh.name} during refresh.`);
          toast({
            title: "URL Refresh Failed",
            description: `Could not get a new download URL for ${sourceToRefresh.name}.`,
            variant: "destructive",
          });
          return;
      }
      
      refreshedSourceItem = {
        ...sourceToRefresh,
        downloadURL: newDownloadURL,
      };
      
      let refreshedListForFirestore: KnowledgeSource[] = [];
      setSources(currentSources => {
        const updatedList = currentSources.map(s =>
          s.id === sourceId ? refreshedSourceItem! : s
        );
        console.log(`[KnowledgeBasePage - handleRefreshSourceUrl] List being set to state (and will be saved): ${updatedList.length} items. Refreshed item ID: ${sourceId}`);
        refreshedListForFirestore = updatedList;
        return updatedList;
      });

      await new Promise(resolve => setTimeout(resolve, 0));
      console.log(`[KnowledgeBasePage - handleRefreshSourceUrl] refreshedListForFirestore after micro-delay: ${refreshedListForFirestore.length} items.`);

      if (refreshedListForFirestore.length > 0) {
          const refreshedInDb = await saveSourcesToFirestore(refreshedListForFirestore);
          if(refreshedInDb) {
              toast({title: "URL Refreshed", description: `Download URL for ${sourceToRefresh.name} updated in database.`});
          }
      } else {
          console.error("[KnowledgeBasePage - handleRefreshSourceUrl] refreshedListForFirestore was empty after micro-delay. This is unexpected.");
          toast({ title: "State Error Refreshing URL", description: "Could not prepare data for saving URL refresh. List was empty.", variant: "destructive" });
      }

    } catch (error) {
      console.error("[KnowledgeBasePage - handleRefreshSourceUrl] Error refreshing download URL:", error);
      toast({title: "Refresh Failed", description: `Could not refresh URL for ${sourceToRefresh.name}.`, variant: "destructive"});
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Upload New Source</CardTitle>
          <CardDescription>
            Add new documents, audio files, or other content to AI Blair's knowledge base. Files are uploaded to Firebase Storage, and their metadata is stored in Firestore.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
              disabled={isCurrentlyUploading || isLoadingSources}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isCurrentlyUploading || isLoadingSources}>
              <UploadCloud className="mr-2 h-4 w-4" /> Choose File
            </Button>
            {selectedFile && <span className="text-sm text-muted-foreground">{selectedFile.name}</span>}
          </div>
           {selectedFile && (
            <p className="text-xs text-muted-foreground">
              Selected: {selectedFile.name} ({(selectedFile.size / (1024*1024)).toFixed(2)} MB) - Type: {selectedFile.type || "unknown"}
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleUpload} disabled={!selectedFile || isCurrentlyUploading || isLoadingSources}>
            {isCurrentlyUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
            {isCurrentlyUploading ? 'Uploading...' : (isLoadingSources ? 'Loading sources...' : 'Upload Source')}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Manage Knowledge Base Sources</CardTitle>
          <CardDescription>View and remove sources. Uploaded files are in Firebase Storage, metadata in Firestore.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingSources ? (
             <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-border rounded-md">
                <RefreshCw className="h-12 w-12 text-muted-foreground mb-4 animate-spin" />
                <p className="text-muted-foreground">Loading knowledge sources...</p>
            </div>
          ) : sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-border rounded-md">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No sources found.</p>
              <p className="text-sm text-muted-foreground">Upload a source to get started.</p>
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
                    {/* Per-item progress removed; general upload status handled by isCurrentlyUploading state */}
                    {source.downloadURL ? (
                      <div className="flex items-center gap-1">
                        <a href={source.downloadURL} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                          View File
                        </a>
                        <Button variant="ghost" size="sm" onClick={() => handleRefreshSourceUrl(source.id)} aria-label="Refresh URL" className="h-6 w-6 p-0">
                            <RefreshCw className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : source.storagePath ? ( // If it has storagePath but no URL yet
                        <span className="text-xs text-yellow-600">Processing... (Refresh URL if stuck)</span>
                    ) : ( // Should not happen for items in 'sources' if logic is correct
                        <span className="text-xs text-gray-500">Error or pending</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(source.id)} aria-label="Delete source" disabled={isCurrentlyUploading || isLoadingSources}>
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
    </div>
  );
}
    
