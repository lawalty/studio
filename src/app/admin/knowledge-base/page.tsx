
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UploadCloud, Trash2, FileText, FileAudio, FileImage, AlertCircle, FileType2, RefreshCw } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { storage } from '@/lib/firebase'; // Firebase storage instance
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { Progress } from "@/components/ui/progress";

interface KnowledgeSource {
  id: string;
  name: string;
  type: 'text' | 'pdf' | 'document' | 'audio' | 'image' | 'other';
  size: string;
  uploadedAt: string;
  storagePath?: string; // Path in Firebase Storage
  downloadURL?: string; // Download URL from Firebase
  uploadProgress?: number; // For upload progress
  isUploading?: boolean;
}

const KNOWLEDGE_SOURCES_STORAGE_KEY = "aiBlairKnowledgeSources";

// Initial sources are local placeholders, not in Firebase by default.
const initialSourcesPlaceholder: Omit<KnowledgeSource, 'id' | 'uploadedAt' | 'storagePath' | 'downloadURL'>[] = [
  { name: 'Pawn_Transactions_Guide.pdf', type: 'pdf', size: '2.3MB' },
  { name: 'Jewelry_Appraisal_Tips.txt', type: 'text', size: '15KB' },
  { name: 'Loan_Regulations_Overview.mp3', type: 'audio', size: '5.1MB' },
  { name: 'Antique_Valuation_Basics.docx', type: 'document', size: '22KB' },
];

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const storedSourcesString = localStorage.getItem(KNOWLEDGE_SOURCES_STORAGE_KEY);
    if (storedSourcesString) {
      try {
        const storedSources = JSON.parse(storedSourcesString) as KnowledgeSource[];
        setSources(storedSources.filter(s => !s.isUploading)); // Remove any stuck uploads
      } catch (e) {
        console.error("Failed to parse sources from localStorage", e);
        setSources([]); // Reset if parsing fails
      }
    } else {
      // Populate with placeholders if localStorage is empty
      const placeholderSources = initialSourcesPlaceholder.map((src, index) => ({
        ...src,
        id: `placeholder-${index}-${Date.now()}`,
        uploadedAt: new Date(Date.now() - (initialSourcesPlaceholder.length - index) * 24*60*60*1000).toISOString().split('T')[0], // Stagger dates
      }));
      setSources(placeholderSources);
    }
  }, []);

  useEffect(() => {
    // Persist sources to localStorage whenever they change, excluding ongoing uploads
    const sourcesToStore = sources.filter(s => !s.isUploading);
    if (sourcesToStore.length > 0 || localStorage.getItem(KNOWLEDGE_SOURCES_STORAGE_KEY)) { // Avoid writing empty array if it was never set
        localStorage.setItem(KNOWLEDGE_SOURCES_STORAGE_KEY, JSON.stringify(sourcesToStore));
    }
  }, [sources]);


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

    const tempId = `uploading-${Date.now()}`;
    let fileType: KnowledgeSource['type'] = 'other';
    const mimeType = selectedFile.type;
    const fileNameLower = selectedFile.name.toLowerCase();

    if (mimeType.startsWith('audio/')) fileType = 'audio';
    else if (mimeType.startsWith('image/')) fileType = 'image';
    else if (mimeType === 'application/pdf') fileType = 'pdf';
    else if (mimeType.startsWith('text/')) fileType = 'text';
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

    setSources(prev => [newSourceDraft, ...prev]);
    const currentFile = selectedFile; // Capture selectedFile
    setSelectedFile(null);
    if(fileInputRef.current) fileInputRef.current.value = "";

    const filePath = `knowledge_base_files/${tempId}-${currentFile.name}`;
    const fileRef = storageRef(storage, filePath);

    try {
      toast({ title: "Upload Started", description: `Uploading ${currentFile.name}...` });
      // For simplicity, using uploadBytes. For progress, uploadBytesResumable would be used.
      // Let's quickly add basic progress for uploadBytesResumable
      const uploadTask = uploadBytes(fileRef, currentFile); // uploadBytesResumable for progress

      // For a real progress indicator, you'd use uploadBytesResumable and listen to 'state_changed'
      // For now, we simulate completion after uploadBytes finishes.
      await uploadTask; // Wait for upload to complete

      const downloadURL = await getDownloadURL(fileRef);

      setSources(prev => prev.map(s => s.id === tempId ? {
        ...s,
        id: `firebase-${Date.now()}`, // Give it a new permanent ID
        storagePath: filePath,
        downloadURL,
        isUploading: false,
        uploadProgress: 100,
      } : s));

      toast({ title: "Upload Successful", description: `${currentFile.name} has been uploaded.` });

    } catch (error) {
      console.error("Upload error:", error);
      toast({ title: "Upload Failed", description: `Could not upload ${currentFile.name}. See console for details.`, variant: "destructive" });
      setSources(prev => prev.filter(s => s.id !== tempId)); // Remove the failed upload attempt
    }
  };

  const handleDelete = async (id: string) => {
    const sourceToDelete = sources.find(s => s.id === id);
    if (!sourceToDelete) return;

    setSources(prev => prev.filter(source => source.id !== id)); // Optimistic UI update

    if (sourceToDelete.storagePath) { // Only try to delete from Firebase if it has a storagePath
      const fileRef = storageRef(storage, sourceToDelete.storagePath);
      try {
        await deleteObject(fileRef);
        toast({ title: "Source Removed", description: `${sourceToDelete.name} has been removed from Firebase Storage and the list.` });
      } catch (error) {
        console.error("Firebase deletion error:", error);
        toast({ title: "Deletion Error", description: `Failed to remove ${sourceToDelete.name} from Firebase Storage. It has been removed from the list.`, variant: "destructive" });
        // Note: The item is already removed from the local list.
        // You might want to add it back if Firebase deletion fails and that's critical.
      }
    } else {
      // If no storagePath, it was a local/placeholder item
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
      setSources(prev => prev.map(s => s.id === sourceId ? {...s, downloadURL: newDownloadURL } : s));
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
            Add new documents, audio files, or other content to AI Blair's knowledge base. Files will be uploaded to Firebase Storage.
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
          <Button onClick={handleUpload} disabled={!selectedFile || sources.some(s => s.isUploading)}>
            <UploadCloud className="mr-2 h-4 w-4" /> {sources.some(s => s.isUploading) ? 'Uploading...' : 'Upload Source'}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Manage Knowledge Base Sources</CardTitle>
          <CardDescription>View and remove sources. Uploaded files are stored in Firebase Storage.</CardDescription>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
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
                        <span className="text-xs text-yellow-600">Processing...</span>
                    )}
                    {!source.storagePath && !source.isUploading && (
                        <span className="text-xs text-gray-500">Local Only</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(source.id)} aria-label="Delete source" disabled={source.isUploading}>
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
