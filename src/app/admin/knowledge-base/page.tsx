
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
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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

const FIRESTORE_KNOWLEDGE_SOURCES_PATH = "configurations/knowledge_base_meta";


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

  useEffect(() => {
    const fetchSources = async () => {
      setIsLoadingSources(true);
      try {
        const docRef = doc(db, FIRESTORE_KNOWLEDGE_SOURCES_PATH);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data()?.sources) {
          const firestoreSources = docSnap.data().sources as KnowledgeSource[];
          setSources(firestoreSources.filter(s => !s.isUploading)); // Remove any stuck uploads from previous sessions
        } else {
          setSources([]); // No sources found in Firestore
        }
      } catch (e) {
        console.error("Failed to fetch sources from Firestore", e);
        toast({ title: "Error Loading Sources", description: "Could not fetch knowledge sources. Please try again.", variant: "destructive" });
        setSources([]);
      }
      setIsLoadingSources(false);
    };
    fetchSources();
  }, [toast]);

  const saveSourcesToFirestore = async (updatedSources: KnowledgeSource[]) => {
    try {
      const docRef = doc(db, FIRESTORE_KNOWLEDGE_SOURCES_PATH);
      // Filter out temporary upload states before saving
      const sourcesToSave = updatedSources.filter(s => !s.isUploading).map(s => {
        const {uploadProgress, isUploading, ...rest} = s; // eslint-disable-line @typescript-eslint/no-unused-vars
        return rest;
      });
      await setDoc(docRef, { sources: sourcesToSave });
    } catch (error) {
      console.error("Error saving sources to Firestore:", error);
      toast({ title: "Error Saving Sources", description: "Could not update knowledge base in the database.", variant: "destructive" });
    }
  };


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

    const tempId = `uploading-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    let fileType: KnowledgeSource['type'] = 'other';
    const mimeType = selectedFile.type;
    const fileNameLower = selectedFile.name.toLowerCase();

    if (mimeType.startsWith('audio/')) fileType = 'audio';
    else if (mimeType.startsWith('image/')) fileType = 'image';
    else if (mimeType === 'application/pdf') fileType = 'pdf';
    else if (mimeType.startsWith('text/plain') || fileNameLower.endsWith('.txt')) fileType = 'text';
    else if (mimeType === 'application/msword' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileNameLower.endsWith('.doc') || fileNameLower.endsWith('.docx')) fileType = 'document';

    const newSourceDraft: KnowledgeSource = {
      id: tempId,
      name: selectedFile.name,
      type: fileType,
      size: `${(selectedFile.size / (1024 * 1024)).toFixed(2)}MB`,
      uploadedAt: new Date().toISOString().split('T')[0],
      isUploading: true,
      uploadProgress: 0,
    };

    const currentSources = [...sources];
    setSources(prev => [newSourceDraft, ...prev]);
    const currentFile = selectedFile;
    setSelectedFile(null);
    if(fileInputRef.current) fileInputRef.current.value = "";

    const filePath = `knowledge_base_files/${tempId}-${currentFile.name}`;
    const fileRef = storageRef(storage, filePath);

    try {
      toast({ title: "Upload Started", description: `Uploading ${currentFile.name}...` });
      await uploadBytes(fileRef, currentFile);
      const downloadURL = await getDownloadURL(fileRef);

      const permanentId = `firebase-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const finalNewSource: KnowledgeSource = {
        ...newSourceDraft,
        id: permanentId,
        storagePath: filePath,
        downloadURL,
        isUploading: false,
        uploadProgress: 100,
      };
      
      const updatedSources = sources.map(s => s.id === tempId ? finalNewSource : s);
      // If the tempId item wasn't found (e.g., state updated too quickly), add finalNewSource to the start
      if (!updatedSources.find(s => s.id === permanentId)) {
        const existingIndex = currentSources.findIndex(s => s.id === tempId);
        if (existingIndex !== -1) {
          currentSources.splice(existingIndex, 1, finalNewSource);
           setSources(currentSources);
           await saveSourcesToFirestore(currentSources);
        } else {
           const newSourceList = [finalNewSource, ...currentSources];
           setSources(newSourceList);
           await saveSourcesToFirestore(newSourceList);
        }
      } else {
        setSources(updatedSources);
        await saveSourcesToFirestore(updatedSources);
      }

      toast({ title: "Upload Successful", description: `${currentFile.name} has been uploaded.` });

    } catch (error: any) {
      console.error("Upload error:", error);
      let description = `Could not upload ${currentFile.name}.`;
      if (error.code) description += ` (Error: ${error.code})`;
      toast({ title: "Upload Failed", description, variant: "destructive", duration: 7000 });
      setSources(prev => prev.filter(s => s.id !== tempId)); 
      // No need to save to Firestore here as the failed upload was never fully added
    }
  };

  const handleDelete = async (id: string) => {
    const sourceToDelete = sources.find(s => s.id === id);
    if (!sourceToDelete) return;

    const updatedSources = sources.filter(source => source.id !== id);
    setSources(updatedSources); // Optimistic UI update

    if (sourceToDelete.storagePath) {
      const fileRef = storageRef(storage, sourceToDelete.storagePath);
      try {
        await deleteObject(fileRef);
        await saveSourcesToFirestore(updatedSources);
        toast({ title: "Source Removed", description: `${sourceToDelete.name} has been removed from Firebase and the list.` });
      } catch (error) {
        console.error("Firebase deletion error:", error);
        toast({ title: "Deletion Error", description: `Failed to remove ${sourceToDelete.name} from Firebase Storage. It has been removed from the list. Database may be out of sync.`, variant: "destructive" });
        // Revert UI if critical, or allow manual refresh. For now, list is updated.
        // Consider re-fetching or adding sourceToDelete back if Firestore save fails significantly.
      }
    } else {
      // If no storagePath, it was a local/placeholder item (should not happen if placeholders are removed)
      // or an item whose storage path was never set. Just save the filtered list.
      await saveSourcesToFirestore(updatedSources);
      toast({ title: "Source Removed", description: `${sourceToDelete.name} has been removed from the list.` });
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
      const updatedSources = sources.map(s => s.id === sourceId ? {...s, downloadURL: newDownloadURL } : s);
      setSources(updatedSources);
      await saveSourcesToFirestore(updatedSources);
      toast({title: "URL Refreshed", description: `Download URL for ${sourceToRefresh.name} updated.`});
    } catch (error) {
      console.error("Error refreshing download URL:", error);
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
          <Button onClick={handleUpload} disabled={!selectedFile || sources.some(s => s.isUploading) || isLoadingSources}>
            <UploadCloud className="mr-2 h-4 w-4" /> 
            {sources.some(s => s.isUploading) ? 'Uploading...' : (isLoadingSources ? 'Loading sources...' : 'Upload Source')}
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
                        <a href={source.downloadURL} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                          View File
                        </a>
                        <Button variant="ghost" size="icon" onClick={() => handleRefreshSourceUrl(source.id)} aria-label="Refresh URL" className="h-6 w-6">
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
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(source.id)} aria-label="Delete source" disabled={source.isUploading || isLoadingSources}>
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
