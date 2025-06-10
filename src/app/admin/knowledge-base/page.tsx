
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UploadCloud, Trash2, FileText, FileAudio, FileImage, AlertCircle, FileType2, RefreshCw } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Progress } from "@/components/ui/progress";

export interface KnowledgeSource {
  id: string;
  name: string;
  type: 'text' | 'pdf' | 'document' | 'audio' | 'image' | 'other';
  size: string;
  uploadedAt: string;
  storagePath?: string;
  downloadURL?: string;
  uploadProgress?: number;
  isUploading?: boolean;
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const saveSourcesToFirestore = async (updatedSourcesToSave: KnowledgeSource[]): Promise<boolean> => {
    try {
      const sourcesToSave = updatedSourcesToSave
        .map(s => {
          console.log(`[KnowledgeBasePage - saveSourcesToFirestore MAP] Processing source ID: ${s.id}, Name: ${s.name}, downloadURL: ${s.downloadURL}, storagePath: ${s.storagePath}`);
          // Explicitly create the object to save, ensuring no temporary fields are included
          const cleanSource: {
            id: string;
            name: string;
            type: KnowledgeSource['type'];
            size: string;
            uploadedAt: string;
            storagePath?: string;
            downloadURL?: string;
          } = {
            id: s.id,
            name: s.name,
            type: s.type,
            size: s.size,
            uploadedAt: s.uploadedAt,
          };
          if (s.storagePath) {
            cleanSource.storagePath = s.storagePath;
          }
          if (s.downloadURL) {
            cleanSource.downloadURL = s.downloadURL;
          }
          return cleanSource;
        });

      console.log(`[KnowledgeBasePage - saveSourcesToFirestore] Attempting to save ${sourcesToSave.length} sources to Firestore. Document path: ${FIRESTORE_KNOWLEDGE_SOURCES_PATH}`, JSON.stringify(sourcesToSave, null, 2));

      const docRef = doc(db, FIRESTORE_KNOWLEDGE_SOURCES_PATH);
      await setDoc(docRef, { sources: sourcesToSave });
      console.log(`[KnowledgeBasePage - saveSourcesToFirestore] Successfully saved ${sourcesToSave.length} sources to Firestore.`);
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
          const firestoreSources = docSnap.data().sources as KnowledgeSource[];
          setSources(firestoreSources);
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
  }, []); 


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

    const currentFile = selectedFile;
    const tempId = `uploading-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    let fileType: KnowledgeSource['type'] = 'other';
    const mimeType = currentFile.type;
    const fileNameLower = currentFile.name.toLowerCase();

    if (mimeType.startsWith('audio/')) fileType = 'audio';
    else if (mimeType.startsWith('image/')) fileType = 'image';
    else if (mimeType === 'application/pdf') fileType = 'pdf';
    else if (mimeType.startsWith('text/plain') || fileNameLower.endsWith('.txt')) fileType = 'text';
    else if (mimeType === 'application/msword' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileNameLower.endsWith('.doc') || fileNameLower.endsWith('.docx')) fileType = 'document';

    const newSourceDraft: KnowledgeSource = {
      id: tempId,
      name: currentFile.name,
      type: fileType,
      size: `${(currentFile.size / (1024 * 1024)).toFixed(2)}MB`,
      uploadedAt: new Date().toISOString().split('T')[0],
      isUploading: true,
      uploadProgress: 0,
    };

    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    
    setSources(prevSources => [newSourceDraft, ...prevSources]);

    const filePath = `knowledge_base_files_v2/${tempId}-${currentFile.name}`;
    const fileRef = storageRef(storage, filePath);

    try {
      toast({ title: "Upload Started", description: `Uploading ${currentFile.name}...` });
      setSources(prev => prev.map(s => s.id === tempId ? {...s, uploadProgress: 30 } : s));

      await uploadBytes(fileRef, currentFile);
      setSources(prev => prev.map(s => s.id === tempId ? {...s, uploadProgress: 70 } : s));
      
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
        setSources(prev => prev.filter(s => s.id !== tempId)); 
        return;
      }
      
      const permanentId = `firebase-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const finalNewSource: KnowledgeSource = {
        ...newSourceDraft,
        id: permanentId, 
        storagePath: filePath,
        downloadURL: downloadURL,
        isUploading: false,
        uploadProgress: 100,
      };
      console.log("[KnowledgeBasePage - handleUpload] finalNewSource created:", JSON.stringify(finalNewSource, null, 2));
      
      let actualFinalListForFirestore: KnowledgeSource[] = [];
      setSources(currentSourcesIncludingDraft => {
        const updatedList = currentSourcesIncludingDraft.map(s =>
          s.id === tempId ? finalNewSource : s 
        );
        actualFinalListForFirestore = updatedList;
        console.log("[KnowledgeBasePage - handleUpload] updatedListForStateAndFirestore being sent to setSources and saveSourcesToFirestore:", JSON.stringify(actualFinalListForFirestore, null, 2));
        return updatedList; 
      });
      
      const savedToDb = await saveSourcesToFirestore(actualFinalListForFirestore);

      if (savedToDb) {
        toast({ title: "Upload Successful", description: `${currentFile.name} has been uploaded and saved to the database.` });
      }

    } catch (error: any) {
      console.error("[KnowledgeBasePage - handleUpload] Upload or Save error:", error);
      let description = `Could not upload or save ${currentFile.name}.`;
      if (error.code) description += ` (Error: ${error.code})`;
      else if (error.message) description += ` (Message: ${error.message})`;
      toast({ title: "Upload Failed", description, variant: "destructive", duration: 7000 });
      setSources(prev => prev.filter(s => s.id !== tempId)); 
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
        toast({ title: "Deletion Error", description: `Failed to remove ${sourceToDelete.name} from Firebase Storage. It has been removed from the list. Database may be out of sync.`, variant: "destructive" });
        setSources(originalSources); 
      }
    } else { 
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
      
      let refreshedListForFirestore: KnowledgeSource[] = [];
      setSources(currentSources => {
        const updatedList = currentSources.map(s => 
          s.id === sourceId ? { ...s, downloadURL: newDownloadURL } : s
        );
        refreshedListForFirestore = updatedList;
        return updatedList;
      });
      
      console.log("[KnowledgeBasePage - handleRefreshSourceUrl] refreshedListForFirestore for save:", JSON.stringify(refreshedListForFirestore, null, 2));
      
      const refreshedInDb = await saveSourcesToFirestore(refreshedListForFirestore);
      
      if(refreshedInDb) {
        toast({title: "URL Refreshed", description: `Download URL for ${sourceToRefresh.name} updated in database.`});
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
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
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
          <Button onClick={handleUpload} disabled={!selectedFile || sources.some(s => !!s.isUploading) || isLoadingSources}>
            <UploadCloud className="mr-2 h-4 w-4" />
            {sources.some(s => !!s.isUploading) ? 'Uploading...' : (isLoadingSources ? 'Loading sources...' : 'Upload Source')}
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
                    {source.isUploading && typeof source.uploadProgress === 'number' && (
                       <div className="flex items-center gap-2">
                        <Progress value={source.uploadProgress} className="w-[100px]" />
                        <span>{source.uploadProgress}%</span>
                       </div>
                    )}
                    {!source.isUploading && source.downloadURL && (
                      <div className="flex items-center gap-1">
                        <a href={source.downloadURL} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                          View File
                        </a>
                        <Button variant="ghost" size="sm" onClick={() => handleRefreshSourceUrl(source.id)} aria-label="Refresh URL" className="h-6 w-6 p-0">
                            <RefreshCw className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {!source.isUploading && !source.downloadURL && source.storagePath && (
                        <span className="text-xs text-yellow-600">Processing... (Refresh URL if stuck)</span>
                    )}
                     {!source.isUploading && !source.downloadURL && !source.storagePath && (
                        <span className="text-xs text-gray-500">Error or Local Draft</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(source.id)} aria-label="Delete source" disabled={!!source.isUploading || isLoadingSources}>
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
    
