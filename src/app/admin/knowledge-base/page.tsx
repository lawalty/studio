
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UploadCloud, Trash2, FileText, FileAudio, FileImage, AlertCircle, FileType2, RefreshCw, Loader2, ArrowRightLeft, Edit3, Save } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject, getBlob } from "firebase/storage";
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";


export interface KnowledgeSource {
  id: string;
  name: string;
  type: 'text' | 'pdf' | 'document' | 'audio' | 'image' | 'other';
  size: string;
  uploadedAt: string;
  storagePath: string;
  downloadURL: string;
  description?: string;
}

export type KnowledgeBaseLevel = 'High' | 'Medium' | 'Low' | 'Archive';
const KB_LEVELS: KnowledgeBaseLevel[] = ['High', 'Medium', 'Low', 'Archive'];

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
  },
  Archive: {
    firestorePath: "configurations/kb_archive_meta_v1",
    storageFolder: "knowledge_base_files_archive_v1/",
    title: "Archive Knowledge Base"
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

const getFilenameWithoutExtensionFromString = (filenameWithExt: string | undefined): string | null => {
    if (!filenameWithExt) return null;
    const lastDotIndex = filenameWithExt.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) return null; // No extension or hidden file like .bashrc
    return filenameWithExt.substring(0, lastDotIndex);
};


export default function KnowledgeBasePage() {
  const [sourcesHigh, setSourcesHigh] = useState<KnowledgeSource[]>([]);
  const [sourcesMedium, setSourcesMedium] = useState<KnowledgeSource[]>([]);
  const [sourcesLow, setSourcesLow] = useState<KnowledgeSource[]>([]);
  const [sourcesArchive, setSourcesArchive] = useState<KnowledgeSource[]>([]);

  const [isLoadingHigh, setIsLoadingHigh] = useState(true);
  const [isLoadingMedium, setIsLoadingMedium] = useState(true);
  const [isLoadingLow, setIsLoadingLow] = useState(true);
  const [isLoadingArchive, setIsLoadingArchive] = useState(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [isCurrentlyUploading, setIsCurrentlyUploading] = useState(false);
  const [selectedKBTargetForUpload, setSelectedKBTargetForUpload] = useState<KnowledgeBaseLevel>('Medium');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [sourceToMoveDetails, setSourceToMoveDetails] = useState<{ source: KnowledgeSource; currentLevel: KnowledgeBaseLevel } | null>(null);
  const [selectedTargetMoveLevel, setSelectedTargetMoveLevel] = useState<KnowledgeBaseLevel | null>(null);
  const [isMovingSource, setIsMovingSource] = useState(false);

  const [showDescriptionDialog, setShowDescriptionDialog] = useState(false);
  const [editingSourceDetails, setEditingSourceDetails] = useState<{ source: KnowledgeSource; level: KnowledgeBaseLevel } | null>(null);
  const [descriptionInput, setDescriptionInput] = useState('');
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  const currentListenerUnsubscribeRef = useRef<(() => void) | null>(null);
  const currentTrackingDocIdRef = useRef<string | null>(null);
  const extractionToastTimoutRef = useRef<NodeJS.Timeout | null>(null);


  const getSourcesSetter = useCallback((level: KnowledgeBaseLevel): React.Dispatch<React.SetStateAction<KnowledgeSource[]>> => {
    if (level === 'High') return setSourcesHigh;
    if (level === 'Medium') return setSourcesMedium;
    if (level === 'Low') return setSourcesLow;
    return setSourcesArchive;
  }, []);

  const getIsLoadingSetter = useCallback((level: KnowledgeBaseLevel): React.Dispatch<React.SetStateAction<boolean>> => {
    if (level === 'High') return setIsLoadingHigh;
    if (level === 'Medium') return setIsLoadingMedium;
    if (level === 'Low') return setIsLoadingLow;
    return setIsLoadingArchive;
  }, []);
  
  const getSourcesState = useCallback((level: KnowledgeBaseLevel): KnowledgeSource[] => {
    if (level === 'High') return sourcesHigh;
    if (level === 'Medium') return sourcesMedium;
    if (level === 'Low') return sourcesLow;
    return sourcesArchive;
  }, [sourcesHigh, sourcesMedium, sourcesLow, sourcesArchive]);


  const saveSourcesToFirestore = useCallback(async (updatedSourcesToSave: KnowledgeSource[], level: KnowledgeBaseLevel): Promise<boolean> => {
    try {
      const config = KB_CONFIG[level];
      const sourcesForDb = updatedSourcesToSave.map(s => ({
        id: s.id, name: s.name, type: s.type, size: s.size,
        uploadedAt: s.uploadedAt, storagePath: s.storagePath, downloadURL: s.downloadURL,
        description: s.description || '', 
      }));

      if (sourcesForDb.some(s => !s.id || !s.downloadURL || !s.storagePath)) {
        console.error(`[KBPage - saveSources - ${level}] Attempted to save sources with missing id, URL or Path. Aborting.`, sourcesForDb.filter(s=>!s.id || !s.downloadURL || !s.storagePath));
        toast({ title: "Internal Save Error", description: `Cannot save incomplete metadata for ${level} KB.`, variant: "destructive"});
        return false;
      }
      
      const docRef = doc(db, config.firestorePath);
      await setDoc(docRef, { sources: sourcesForDb });
      return true;
    } catch (error: any) {
      console.error(`[KBPage - saveSources - ${level}] Error saving to Firestore:`, error);
      toast({ title: "Firestore Save Error", description: `Failed to save ${level} KB: ${error.message || 'Unknown'}.`, variant: "destructive"});
      return false;
    }
  }, [toast]);

  const monitorPdfExtraction = useCallback((documentId: string, userFriendlyFileName: string) => {
    if (currentListenerUnsubscribeRef.current) {
      currentListenerUnsubscribeRef.current();
    }
    if (extractionToastTimoutRef.current) {
      clearTimeout(extractionToastTimoutRef.current);
    }
    currentTrackingDocIdRef.current = documentId;
    console.log(`[KBPage - monitorPdfExtraction] Monitoring Firestore document: sources/${documentId} for file: ${userFriendlyFileName}`);

    extractionToastTimoutRef.current = setTimeout(() => {
      if (currentTrackingDocIdRef.current === documentId && currentListenerUnsubscribeRef.current) {
        currentListenerUnsubscribeRef.current();
        currentListenerUnsubscribeRef.current = null;
        currentTrackingDocIdRef.current = null;
        toast({ 
            title: "PDF Processing Delayed",
            description: `Text extraction for '${userFriendlyFileName}' (monitoring ID: ${documentId}) is taking longer than 2 minutes. The UI listener has timed out. Please check Cloud Function logs or Firestore at 'sources/${documentId}' for final status.`,
            duration: 15000 // Increased duration for this important message
        });
      }
    }, 2 * 60 * 1000); // 2 minutes timeout

    currentListenerUnsubscribeRef.current = onSnapshot(doc(db, 'sources', documentId), (docSnap) => {
      if (currentTrackingDocIdRef.current !== documentId || !currentListenerUnsubscribeRef.current) {
        return; 
      }

      if (docSnap.exists()) {
        const data = docSnap.data();
        let processed = false;
        if (data.extractionStatus === 'success') {
          toast({ title: "PDF Processed", description: `Text successfully extracted from ${userFriendlyFileName}. Monitored ID: ${documentId}` });
          processed = true;
        } else if (data.extractionStatus === 'failed') {
          toast({ title: "PDF Processing Error", description: `Failed to extract text from ${userFriendlyFileName} (ID: ${documentId}). Error: ${data.extractionError || 'Check Cloud Function logs.'}`, variant: "destructive", duration: 10000 });
          processed = true;
        } else if (data.extractedText && !data.extractionStatus && data.extractionStatus !== 'pending') {
           toast({ title: "PDF Text Found", description: `Text for ${userFriendlyFileName} (ID: ${documentId}) is available.` });
           processed = true;
        }


        if (processed) {
          if (extractionToastTimoutRef.current) clearTimeout(extractionToastTimoutRef.current);
          if (currentListenerUnsubscribeRef.current) {
            currentListenerUnsubscribeRef.current();
            currentListenerUnsubscribeRef.current = null;
          }
          currentTrackingDocIdRef.current = null;
        }
      }
    }, (error) => {
        console.error(`[KBPage - monitorPdfExtraction] Error listening to Firestore document sources/${documentId}:`, error);
        toast({ title: "Listener Error", description: `Error monitoring PDF extraction for ${userFriendlyFileName} (ID: ${documentId}).`, variant: "destructive"});
        if (extractionToastTimoutRef.current) clearTimeout(extractionToastTimoutRef.current);
        if (currentListenerUnsubscribeRef.current) {
            currentListenerUnsubscribeRef.current();
            currentListenerUnsubscribeRef.current = null;
        }
        currentTrackingDocIdRef.current = null;
    });
  }, [toast]);

  useEffect(() => {
    return () => {
      if (currentListenerUnsubscribeRef.current) {
        currentListenerUnsubscribeRef.current();
      }
      if (extractionToastTimoutRef.current) {
        clearTimeout(extractionToastTimoutRef.current);
      }
    };
  }, []);


  const fetchSourcesForLevel = useCallback(async (level: KnowledgeBaseLevel) => {
    const setIsLoading = getIsLoadingSetter(level);
    const setSources = getSourcesSetter(level);
    const config = KB_CONFIG[level];

    setIsLoading(true);
    try {
      const docRef = doc(db, config.firestorePath);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data()?.sources) {
        const fetchedSources = (docSnap.data().sources as KnowledgeSource[]).map(s => ({
          ...s,
          description: s.description || '', 
        }));
        setSources(fetchedSources);
      } else {
        setSources([]);
      }
    } catch (e: any) {
      console.error(`[KBPage - fetchSources - ${level}] Failed:`, e.message);
      toast({ title: `Error Loading ${level} KB`, description: `Could not fetch sources: ${e.message}.`, variant: "destructive" });
      setSources([]);
    }
    setIsLoading(false);
  }, [toast, getIsLoadingSetter, getSourcesSetter]); 

  useEffect(() => {
    fetchSourcesForLevel('High');
    fetchSourcesForLevel('Medium');
    fetchSourcesForLevel('Low');
    fetchSourcesForLevel('Archive');
  }, [fetchSourcesForLevel]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      toast({ title: "No file selected", variant: "destructive" });
      return;
    }
    if (isCurrentlyUploading || isMovingSource || isSavingDescription) {
      toast({ title: "Operation in Progress", description: "Please wait for the current operation to complete.", variant: "default" });
      return;
    }

    setIsCurrentlyUploading(true);
    const currentFile = selectedFile;
    const targetLevel = selectedKBTargetForUpload;
    const config = KB_CONFIG[targetLevel];
    const setSources = getSourcesSetter(targetLevel);
    const currentSources = getSourcesState(targetLevel);
    
    const timestampForFile = Date.now();
    // Sanitize original name: replace spaces with underscores, remove other problematic chars
    const sanitizedOriginalName = currentFile.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const filenameInStorageWithTimestamp = `${timestampForFile}-${sanitizedOriginalName}`;
    const filePath = `${config.storageFolder}${filenameInStorageWithTimestamp}`;
    
    const fileRef = storageRef(storage, filePath);
    const permanentId = `firebase-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      toast({ title: "Upload Started", description: `Uploading ${currentFile.name} to ${targetLevel} KB...` });
      await uploadBytes(fileRef, currentFile);
      const downloadURL = await getDownloadURL(fileRef);

      if (!downloadURL) {
        toast({ title: "URL Retrieval Failed", description: `Could not get URL for ${currentFile.name}. Metadata not saved.`, variant: "destructive"});
        setIsCurrentlyUploading(false); 
        setSelectedFile(null);
        setUploadDescription('');
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
        description: uploadDescription || '',
      };

      const newListForStateAndFirestore = [newSource, ...currentSources];
      
      const savedToDb = await saveSourcesToFirestore(newListForStateAndFirestore, targetLevel);
      if (savedToDb) {
        setSources(newListForStateAndFirestore);
        toast({ title: "Upload Successful", description: `${currentFile.name} saved to ${targetLevel} KB.` });

        if (newSource.type === 'pdf') {
          const docIdForSourceCollection = getFilenameWithoutExtensionFromString(filenameInStorageWithTimestamp);
          if (docIdForSourceCollection) {
            monitorPdfExtraction(docIdForSourceCollection, currentFile.name); 
          } else {
            console.warn(`[KBPage - Upload] Could not form documentId for monitoring PDF: ${currentFile.name} from storage filename ${filenameInStorageWithTimestamp}`);
          }
        }
      } else {
        toast({ title: "Database Save Failed", description: `File uploaded but DB save failed for ${targetLevel} KB. Reverting.`, variant: "destructive"});
        try { await deleteObject(fileRef); } catch (delError) { console.warn("Failed to clean up orphaned file after DB save error:", delError); }
      }
    } catch (error: any) {
      toast({ title: "Upload Failed", description: `Could not upload/save to ${targetLevel} KB: ${error.message || 'Unknown'}.`, variant: "destructive"});
    } finally {
      setIsCurrentlyUploading(false);
      setSelectedFile(null);
      setUploadDescription('');
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [selectedFile, toast, selectedKBTargetForUpload, getSourcesSetter, getSourcesState, saveSourcesToFirestore, uploadDescription, isCurrentlyUploading, isMovingSource, isSavingDescription, monitorPdfExtraction]);

  const handleDelete = useCallback(async (id: string, level: KnowledgeBaseLevel) => {
    if (isCurrentlyUploading || isMovingSource || isSavingDescription) {
      toast({ title: "Operation in Progress", description: "Please wait for the current operation to complete.", variant: "default" });
      return;
    }
    const currentSources = getSourcesState(level);
    const setSources = getSourcesSetter(level);
    const sourceToDelete = currentSources.find(s => s.id === id);
    if (!sourceToDelete) return;

    const originalSources = [...currentSources];
    const updatedSourcesAfterDelete = currentSources.filter(source => source.id !== id);
    
    let dbUpdated = false;
    try {
        if (sourceToDelete.storagePath) {
            const fileRef = storageRef(storage, sourceToDelete.storagePath);
            await deleteObject(fileRef);
        }
        dbUpdated = await saveSourcesToFirestore(updatedSourcesAfterDelete, level);
        if (dbUpdated) {
            setSources(updatedSourcesAfterDelete);
            toast({ title: "Source Removed", description: `${sourceToDelete.name} removed from ${level} KB and Storage.` });
        } else {
            toast({ title: "Deletion Error", description: `Failed to update DB for ${sourceToDelete.name} in ${level} KB. UI reverted.`, variant: "destructive" });
            setSources(originalSources); 
        }
    } catch (error) {
        console.error(`[KBPage - handleDelete - ${level}] Firebase deletion error:`, error);
        toast({ title: "Deletion Error", description: `Failed to remove ${sourceToDelete.name} from Storage or DB for ${level} KB.`, variant: "destructive" });
        setSources(originalSources); 
    }
  }, [getSourcesState, getSourcesSetter, saveSourcesToFirestore, toast, isCurrentlyUploading, isMovingSource, isSavingDescription]);

  const handleRefreshSourceUrl = useCallback(async (sourceId: string, level: KnowledgeBaseLevel) => {
    if (isCurrentlyUploading || isMovingSource || isSavingDescription) {
        toast({ title: "Operation in Progress", description: "Please wait for current operation to complete.", variant: "default" });
        return;
    }
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
          toast({ title: "URL Refresh Failed", description: `Could not get new URL for ${sourceToRefresh.name} in ${level} KB.`, variant: "destructive"});
          return;
      }
      
      const refreshedSourceItem: KnowledgeSource = { ...sourceToRefresh, downloadURL: newDownloadURL };
      const listWithRefreshedUrl = currentSources.map(s => s.id === sourceId ? refreshedSourceItem : s);
      
      const refreshedInDb = await saveSourcesToFirestore(listWithRefreshedUrl, level); 
      if(refreshedInDb) {
          setSources(listWithRefreshedUrl);
          toast({title: "URL Refreshed", description: `URL for ${sourceToRefresh.name} in ${level} KB updated.`});
      } else {
          toast({title: "Refresh Save Error", description: "URL refreshed, but DB save failed. Reverting.", variant: "destructive"});
          setSources(originalSourcesSnapshot);
      }
    } catch (error) {
      toast({title: "Refresh Failed", description: `Could not refresh URL for ${sourceToRefresh.name} in ${level} KB.`, variant: "destructive"});
      setSources(originalSourcesSnapshot); 
    }
  }, [getSourcesState, getSourcesSetter, saveSourcesToFirestore, toast, isCurrentlyUploading, isMovingSource, isSavingDescription]);

  const handleOpenMoveDialog = useCallback((source: KnowledgeSource, currentLevel: KnowledgeBaseLevel) => {
    if (isCurrentlyUploading || isMovingSource || isSavingDescription) {
      toast({ title: "Operation in Progress", description: "Please wait for current operation to complete.", variant: "default" });
      return;
    }
    setSourceToMoveDetails({ source, currentLevel });
    setSelectedTargetMoveLevel(null);
    setShowMoveDialog(true);
  }, [toast, isCurrentlyUploading, isMovingSource, isSavingDescription]);

  const handleConfirmMoveSource = useCallback(async () => {
    if (!sourceToMoveDetails || !selectedTargetMoveLevel || isMovingSource) return;

    const { source, currentLevel } = sourceToMoveDetails;
    const targetLevel = selectedTargetMoveLevel;

    if (currentLevel === targetLevel) {
      toast({ title: "Invalid Move", description: "Source is already in the selected priority level.", variant: "default" });
      return;
    }

    setIsMovingSource(true);
    toast({ title: "Move Started", description: `Moving ${source.name} from ${currentLevel} to ${targetLevel}...` });

    let newStoragePath = '';
    let newDownloadURL = '';
    let tempFileRef = null;

    try {
      const originalFileRef = storageRef(storage, source.storagePath);
      const blob = await getBlob(originalFileRef);
      
      const timestampForFile = Date.now();
      const sanitizedOriginalName = source.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
      const newFilenameInStorage = `${timestampForFile}-${sanitizedOriginalName}`;
      newStoragePath = `${KB_CONFIG[targetLevel].storageFolder}${newFilenameInStorage}`;

      tempFileRef = storageRef(storage, newStoragePath);
      await uploadBytes(tempFileRef, blob, { contentType: blob.type });
      newDownloadURL = await getDownloadURL(tempFileRef);

      if (!newDownloadURL) {
        throw new Error("Failed to get download URL for the copied file.");
      }

      const movedSource: KnowledgeSource = { ...source, storagePath: newStoragePath, downloadURL: newDownloadURL, description: source.description || '' };

      const targetSetSources = getSourcesSetter(targetLevel);
      const targetCurrentSources = getSourcesState(targetLevel);
      const newTargetList = [movedSource, ...targetCurrentSources];
      const savedToTargetDb = await saveSourcesToFirestore(newTargetList, targetLevel);
      if (!savedToTargetDb) {
        throw new Error(`Failed to save metadata to ${targetLevel} Firestore.`);
      }
      targetSetSources(newTargetList);

      const originalSetSources = getSourcesSetter(currentLevel);
      const originalCurrentSources = getSourcesState(currentLevel);
      const newOriginalList = originalCurrentSources.filter(s => s.id !== source.id);
      const removedFromOriginalDb = await saveSourcesToFirestore(newOriginalList, currentLevel);
      if (!removedFromOriginalDb) {
         console.error(`[KBPage - Move] CRITICAL: Failed to remove metadata from ${currentLevel} Firestore after successful copy and target save for ${source.name}. Manual check needed.`);
         toast({title: "Move Partial Success", description: `Moved to ${targetLevel}, but failed to update ${currentLevel} DB. Please verify.`, variant: "destructive", duration: 10000});
      } else {
        originalSetSources(newOriginalList);
      }
      
      await deleteObject(originalFileRef);
      toast({ title: "Move Successful", description: `${source.name} moved from ${currentLevel} to ${targetLevel}.` });
      
      if (source.type === 'pdf') {
        const oldDocIdForSourceCollection = getFilenameWithoutExtensionFromString(source.storagePath.split('/').pop());
        if (oldDocIdForSourceCollection && currentTrackingDocIdRef.current === oldDocIdForSourceCollection) {
          if (currentListenerUnsubscribeRef.current) currentListenerUnsubscribeRef.current();
          if (extractionToastTimoutRef.current) clearTimeout(extractionToastTimoutRef.current);
          currentTrackingDocIdRef.current = null;
          currentListenerUnsubscribeRef.current = null;
        }
        const newDocIdForSourceCollection = getFilenameWithoutExtensionFromString(newFilenameInStorage);
        if (newDocIdForSourceCollection) {
            monitorPdfExtraction(newDocIdForSourceCollection, source.name);
        }
      }


    } catch (error: any) {
      console.error(`[KBPage - Move] Error moving ${source.name}:`, error);
      toast({ title: "Move Failed", description: `Could not move source: ${error.message || 'Unknown error'}.`, variant: "destructive" });
      if (tempFileRef && newDownloadURL) {
        const targetDocRef = doc(db, KB_CONFIG[targetLevel].firestorePath);
        const targetDocSnap = await getDoc(targetDocRef);
        const targetSources = targetDocSnap.data()?.sources as KnowledgeSource[] | undefined;
        if (!targetSources || !targetSources.find(s => s.id === source.id && s.storagePath === newStoragePath)) {
            try { await deleteObject(tempFileRef); } catch (cleanupError) { console.error("[KBPage - Move] Failed to cleanup copied file after move failure:", cleanupError); }
        }
      }
      fetchSourcesForLevel(currentLevel); 
      fetchSourcesForLevel(targetLevel);
    } finally {
      setIsMovingSource(false);
      setShowMoveDialog(false);
      setSourceToMoveDetails(null);
      setSelectedTargetMoveLevel(null);
    }
  }, [sourceToMoveDetails, selectedTargetMoveLevel, isMovingSource, toast, getSourcesSetter, getSourcesState, saveSourcesToFirestore, fetchSourcesForLevel, monitorPdfExtraction]);

  const handleOpenDescriptionDialog = useCallback((source: KnowledgeSource, level: KnowledgeBaseLevel) => {
    if (isCurrentlyUploading || isMovingSource || isSavingDescription) {
      toast({ title: "Operation in Progress", description: "Please wait for current operation to complete.", variant: "default" });
      return;
    }
    setEditingSourceDetails({ source, level });
    setDescriptionInput(source.description || '');
    setShowDescriptionDialog(true);
  }, [toast, isCurrentlyUploading, isMovingSource, isSavingDescription]);

  const handleSaveDescription = useCallback(async () => {
    if (!editingSourceDetails) return;
    setIsSavingDescription(true);

    const { source, level } = editingSourceDetails;
    const currentSources = getSourcesState(level);
    const setSources = getSourcesSetter(level);

    const updatedSources = currentSources.map(s =>
      s.id === source.id ? { ...s, description: descriptionInput } : s
    );

    const success = await saveSourcesToFirestore(updatedSources, level);
    if (success) {
      setSources(updatedSources);
      toast({ title: "Description Saved", description: `Description for ${source.name} updated.` });
    } else {
      toast({ title: "Error Saving Description", description: `Could not save description for ${source.name}.`, variant: "destructive" });
      fetchSourcesForLevel(level); // Re-fetch to revert UI on failure
    }

    setIsSavingDescription(false);
    setShowDescriptionDialog(false);
    setEditingSourceDetails(null);
    setDescriptionInput('');
  }, [editingSourceDetails, descriptionInput, getSourcesState, getSourcesSetter, saveSourcesToFirestore, toast, fetchSourcesForLevel]);


  const renderKnowledgeBaseSection = (level: KnowledgeBaseLevel) => {
    const sources = getSourcesState(level);
    const isLoadingSources = 
        level === 'High' ? isLoadingHigh :
        level === 'Medium' ? isLoadingMedium :
        level === 'Low' ? isLoadingLow :
        isLoadingArchive;
    const config = KB_CONFIG[level];

    const descriptionText = level === 'Archive'
      ? "Archived sources. Files here are not used by AI Blair for responses but are kept for record-keeping."
      : `View and manage sources. Uploaded files are in Firebase Storage (folder: ${config.storageFolder}), metadata in Firestore (path: ${config.firestorePath}). Descriptions are for admin use only.`;

    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="font-headline">{config.title}</CardTitle>
          <CardDescription>{descriptionText}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingSources ? (
             <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-border rounded-md">
                <RefreshCw className="h-12 w-12 text-muted-foreground mb-4 animate-spin" />
                <p className="text-muted-foreground">Loading {level.toLowerCase()} priority sources...</p>
            </div>
          ) : sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-border rounded-md">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No sources found for {level.toLowerCase()} priority.</p>
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
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
                  <TableCell className="font-medium break-all">{source.name}</TableCell>
                  <TableCell className="capitalize">{source.type}</TableCell>
                  <TableCell>
                    <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => handleOpenDescriptionDialog(source, level)} disabled={isCurrentlyUploading || isMovingSource || isLoadingSources || isSavingDescription}>
                      <Edit3 className="h-3 w-3 mr-1" /> View/Edit
                    </Button>
                  </TableCell>
                  <TableCell>{source.size}</TableCell>
                  <TableCell>{source.uploadedAt}</TableCell>
                  <TableCell>
                    {source.downloadURL ? (
                      <div className="flex items-center gap-1">
                        <a href={source.downloadURL} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                          View File
                        </a>
                        <Button variant="ghost" size="sm" onClick={() => handleRefreshSourceUrl(source.id, level)} aria-label="Refresh URL" className="h-6 w-6 p-0" disabled={isCurrentlyUploading || isMovingSource || isLoadingSources || isSavingDescription}>
                            <RefreshCw className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : source.storagePath ? (
                        <span className="text-xs text-yellow-600">Processing...</span>
                    ) : (
                        <span className="text-xs text-gray-500">Error or pending</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenMoveDialog(source, level)} aria-label="Move source" disabled={isCurrentlyUploading || isMovingSource || isLoadingSources || isSavingDescription}>
                      <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(source.id, level)} aria-label="Delete source" disabled={isCurrentlyUploading || isMovingSource || isLoadingSources || isSavingDescription}>
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

  const anyKbLoading = isLoadingHigh || isLoadingMedium || isLoadingLow || isLoadingArchive;
  const anyOperationInProgress = isCurrentlyUploading || isMovingSource || isSavingDescription;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Upload New Source</CardTitle>
          <CardDescription>
            Add content to AI Blair's knowledge base or archive. Select the target level and add an optional description before uploading.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3">
            <Label htmlFor="file-upload" className="font-medium whitespace-nowrap shrink-0">Step 1: File</Label>
            <div className="flex items-center gap-2">
                <Input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
                disabled={anyOperationInProgress || anyKbLoading}
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={anyOperationInProgress || anyKbLoading} className="w-full sm:w-auto">
                <UploadCloud className="mr-2 h-4 w-4" /> Choose File
                </Button>
                {selectedFile && <span className="text-sm text-muted-foreground truncate">{selectedFile.name}</span>}
            </div>
            {selectedFile && (
                <> 
                  <div/>
                  <p className="text-xs text-muted-foreground col-start-2"> 
                  Selected: {selectedFile.name} ({(selectedFile.size / (1024*1024)).toFixed(2)} MB) - Type: {selectedFile.type || "unknown"}
                  </p>
                </>
            )}

            <Label className="font-medium whitespace-nowrap shrink-0 pt-2">Step 2: Level</Label> 
            <div className="flex flex-col">
              <RadioGroup
                value={selectedKBTargetForUpload}
                onValueChange={(value: string) => setSelectedKBTargetForUpload(value as KnowledgeBaseLevel)}
                className="flex flex-col sm:flex-row sm:space-x-4 pt-2"
              >
                {KB_LEVELS.map(level => (
                  <div key={level} className="flex items-center space-x-2">
                    <RadioGroupItem value={level} id={`r-upload-${level.toLowerCase()}`} disabled={anyOperationInProgress || anyKbLoading}/>
                    <Label htmlFor={`r-upload-${level.toLowerCase()}`}>{level === 'Archive' ? 'Archive' : `${level} Priority`}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <Label htmlFor="uploadDescription" className="font-medium whitespace-nowrap shrink-0 pt-2">Step 3: Description (Optional)</Label>
            <Textarea
                id="uploadDescription"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="Enter a brief description for this source (for admin use only)..."
                rows={2}
                className="mt-1"
                disabled={anyOperationInProgress || anyKbLoading}
            />
          </div>
        </CardContent>
        <CardFooter>
          <div className="flex items-center gap-2">
            <Label className="font-medium whitespace-nowrap shrink-0">Step 4:</Label>
            <Button onClick={handleUpload} disabled={!selectedFile || anyOperationInProgress || anyKbLoading}>
              {isCurrentlyUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              {isCurrentlyUploading ? 'Uploading...' : `Upload to ${selectedKBTargetForUpload === 'Archive' ? 'Archive' : selectedKBTargetForUpload + ' KB'}`}
            </Button>
          </div>
        </CardFooter>
      </Card>

      <Accordion type="multiple" defaultValue={['high-kb', 'medium-kb', 'low-kb', 'archive-kb']} className="w-full">
        {KB_LEVELS.map(level => (
            <AccordionItem value={`${level.toLowerCase()}-kb`} key={`${level.toLowerCase()}-kb`}>
            <AccordionTrigger className="text-xl font-semibold hover:no-underline">{KB_CONFIG[level].title}</AccordionTrigger>
            <AccordionContent>
                {renderKnowledgeBaseSection(level)}
            </AccordionContent>
            </AccordionItem>
        ))}
      </Accordion>

      {sourceToMoveDetails && (
        <AlertDialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Move Knowledge Source</AlertDialogTitle>
              <AlertDialogDescription>
                Move &quot;{sourceToMoveDetails.source.name}&quot; from {sourceToMoveDetails.currentLevel} Priority to:
              </AlertDialogDescription>
            </AlertDialogHeader>
            <RadioGroup
              value={selectedTargetMoveLevel ?? undefined}
              onValueChange={(value) => setSelectedTargetMoveLevel(value as KnowledgeBaseLevel)}
              className="my-4 space-y-2"
            >
              {KB_LEVELS.filter(level => level !== sourceToMoveDetails.currentLevel).map(level => (
                <div key={`move-target-${level}`} className="flex items-center space-x-2">
                  <RadioGroupItem value={level} id={`r-move-${level.toLowerCase()}`} />
                  <Label htmlFor={`r-move-${level.toLowerCase()}`}>{level === 'Archive' ? 'Archive' : `${level} Priority`}</Label>
                </div>
              ))}
            </RadioGroup>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowMoveDialog(false)} disabled={isMovingSource}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmMoveSource} disabled={!selectedTargetMoveLevel || isMovingSource}>
                {isMovingSource ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isMovingSource ? 'Moving...' : 'Confirm Move'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {editingSourceDetails && (
        <Dialog open={showDescriptionDialog} onOpenChange={(open) => {
          if (!open) { 
            setEditingSourceDetails(null); 
            setDescriptionInput(''); 
          }
          setShowDescriptionDialog(open);
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Description for: {editingSourceDetails.source.name}</DialogTitle>
              <DialogDescription>
                This description is for administrative purposes only and is not used by the AI.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={descriptionInput}
              onChange={(e) => setDescriptionInput(e.target.value)}
              placeholder="Enter description..."
              rows={5}
              className="mt-2"
              disabled={isSavingDescription}
            />
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                 <Button type="button" variant="outline" disabled={isSavingDescription}>Cancel</Button>
              </DialogClose>
              <Button onClick={handleSaveDescription} disabled={isSavingDescription}>
                {isSavingDescription ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSavingDescription ? 'Saving...' : 'Save Description'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

    

    
