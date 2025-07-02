
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UploadCloud, Trash2, FileText, FileAudio, FileImage, AlertCircle, FileType2, RefreshCw, Loader2, ArrowRightLeft, Edit3, Save, Brain, SearchCheck, Download, BrainCircuit, Beaker, MessageSquareText, FileQuestion } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject, getBlob } from "firebase/storage";
import { doc, getDoc, setDoc, writeBatch, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { extractTextFromDocumentUrl } from '@/ai/flows/extract-text-from-document-url-flow';
import { indexDocument } from '@/ai/flows/index-document-flow';
import { testKnowledgeBase } from '@/ai/flows/test-knowledge-base-flow';
import { testEmbedding } from '@/ai/flows/test-embedding-flow';
import { testTextGeneration } from '@/ai/flows/test-text-generation-flow';
import { ingestSmeTranscript } from '@/ai/flows/ingest-sme-transcript-flow';


export type KnowledgeSourceExtractionStatus = 'pending' | 'success' | 'failed' | 'not_applicable';
export type KnowledgeSourceIndexingStatus = 'pending' | 'indexed' | 'failed' | 'not_applicable';

export interface KnowledgeSource {
  id: string;
  name: string;
  type: 'text' | 'pdf' | 'document' | 'audio' | 'image' | 'other';
  size: string;
  uploadedAt: string;
  storagePath: string;
  downloadURL: string | null;
  description?: string;
  topic?: string;
  extractionStatus?: KnowledgeSourceExtractionStatus;
  extractionError?: string;
  indexingStatus?: KnowledgeSourceIndexingStatus; 
  indexingError?: string;
}

export type KnowledgeBaseLevel = 'High' | 'Medium' | 'Low' | 'Archive';
const KB_LEVELS: KnowledgeBaseLevel[] = ['High', 'Medium', 'Low', 'Archive'];

const FIRESTORE_SITE_ASSETS_PATH = "configurations/site_display_assets";
const DEFAULT_CONVERSATIONAL_TOPICS = "";

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
    title: "Archived Sources"
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
  const [sourcesArchive, setSourcesArchive] = useState<KnowledgeSource[]>([]);

  const [isLoadingHigh, setIsLoadingHigh] = useState(true);
  const [isLoadingMedium, setIsLoadingMedium] = useState(true);
  const [isLoadingLow, setIsLoadingLow] = useState(true);
  const [isLoadingArchive, setIsLoadingArchive] = useState(true);

  const [availableTopics, setAvailableTopics] = useState<string[]>([]);
  const [conversationalTopics, setConversationalTopics] = useState(DEFAULT_CONVERSATIONAL_TOPICS);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [isCurrentlyUploading, setIsCurrentlyUploading] = useState(false);
  const [selectedKBTargetForUpload, setSelectedKBTargetForUpload] = useState<KnowledgeBaseLevel>('Medium');
  const [selectedTopicForUpload, setSelectedTopicForUpload] = useState<string>('');
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
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);

  const [pastedText, setPastedText] = useState('');
  const [pastedTextSourceName, setPastedTextSourceName] = useState('');
  const [pastedTextDescription, setPastedTextDescription] = useState('');
  const [selectedKBTargetForPastedText, setSelectedKBTargetForPastedText] = useState<KnowledgeBaseLevel>('Medium');
  const [selectedTopicForPastedText, setSelectedTopicForPastedText] = useState<string>('');
  const [isIndexingPastedText, setIsIndexingPastedText] = useState(false);
  
  const [smeTranscript, setSmeTranscript] = useState('');
  const [smeTranscriptSourceName, setSmeTranscriptSourceName] = useState('');
  const [selectedKBTargetForSme, setSelectedKBTargetForSme] = useState<KnowledgeBaseLevel>('Medium');
  const [selectedTopicForSme, setSelectedTopicForSme] = useState<string>('');
  const [isProcessingSme, setIsProcessingSme] = useState(false);


  const [testQuery, setTestQuery] = useState('');
  const [testResult, setTestResult] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  const [isTestingEmbedding, setIsTestingEmbedding] = useState(false);
  const [isTestingGeneration, setIsTestingGeneration] = useState(false);


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
        topic: s.topic || 'General',
        extractionStatus: s.extractionStatus || (s.type === 'pdf' || s.type === 'text' || s.type === 'document' ? 'pending' as const : 'not_applicable' as const),
        extractionError: s.extractionError || '',
        indexingStatus: s.indexingStatus || (s.type === 'pdf' || s.type === 'text' || s.type === 'document' ? 'pending' as const : 'not_applicable' as const),
        indexingError: s.indexingError || '',
      }));

      if (sourcesForDb.some(s => !s.id || s.downloadURL === undefined || !s.storagePath)) {
        console.error(`[KBPage - saveSources - ${level}] Attempted to save sources with missing id, URL or Path. Aborting.`, sourcesForDb.filter(s=>!s.id || s.downloadURL === undefined || !s.storagePath));
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
          topic: s.topic || 'General',
          extractionStatus: s.extractionStatus || (s.type === 'pdf' || s.type === 'text' || s.type === 'document' ? 'pending' as const : 'not_applicable' as const),
          extractionError: s.extractionError || '',
          indexingStatus: s.indexingStatus || (s.type === 'pdf' || s.type === 'text' || s.type === 'document' ? 'pending' as const : 'not_applicable' as const),
          indexingError: s.indexingError || '',
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
    const fetchConversationalTopics = async () => {
        try {
          const docRef = doc(db, FIRESTORE_SITE_ASSETS_PATH);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists() && docSnap.data()?.conversationalTopics) {
              const topicsString = docSnap.data()?.conversationalTopics;
              setConversationalTopics(topicsString);
              const topicsArray = topicsString.split('\n').map((t: string) => t.replace(/^-/, '').trim()).filter(Boolean);
              setAvailableTopics(['General', ...topicsArray]);
          }
        } catch (error) {
            console.warn("Could not fetch conversational topics for text extraction.", error);
            setAvailableTopics(['General']);
        }
    };
    fetchConversationalTopics();
  }, []);

  // Effect for fetching all KB levels
  useEffect(() => {
    KB_LEVELS.forEach(level => fetchSourcesForLevel(level));
  }, [fetchSourcesForLevel]);

  const updateSourceStatus = useCallback(async (
    id: string,
    level: KnowledgeBaseLevel,
    updates: Partial<Pick<KnowledgeSource, 'extractionStatus' | 'extractionError' | 'indexingStatus' | 'indexingError'>>
  ) => {
    const sources = getSourcesState(level);
    const setSources = getSourcesSetter(level);
    
    const updatedSources = sources.map(s => s.id === id ? { ...s, ...updates } : s);
    setSources(updatedSources);
    await saveSourcesToFirestore(updatedSources, level);
  }, [getSourcesState, getSourcesSetter, saveSourcesToFirestore]);

  const triggerProcessing = useCallback(async (sourceToProcess: KnowledgeSource, level: KnowledgeBaseLevel) => {
    if (!['pdf', 'text', 'document'].includes(sourceToProcess.type)) {
      console.log(`[KBPage] Skipping processing for non-text file: ${sourceToProcess.name}`);
      return;
    }
    setIsProcessingId(sourceToProcess.id);
    let extractedText = '';
    
    // Step 1: Extract Text
    try {
      if (!sourceToProcess.downloadURL) throw new Error("Source has no download URL to process.");
      await updateSourceStatus(sourceToProcess.id, level, { extractionStatus: 'pending', extractionError: '', indexingStatus: 'pending', indexingError: '' });
      const { extractedText: text, } = await extractTextFromDocumentUrl({ documentUrl: sourceToProcess.downloadURL, conversationalTopics: conversationalTopics });
      extractedText = text;
      await updateSourceStatus(sourceToProcess.id, level, { extractionStatus: 'success' });
    } catch (e: any) {
      console.error(`[KBPage - triggerProcessing - Extraction] Error for source ${sourceToProcess.name}:`, e);
      const errorMessage = e.message || 'An unknown error occurred during text extraction.';
      await updateSourceStatus(sourceToProcess.id, level, { extractionStatus: 'failed', extractionError: errorMessage });
      toast({ title: "Text Extraction Failed", description: `${sourceToProcess.name}: ${errorMessage}`, variant: "destructive", duration: 10000 });
      setIsProcessingId(null);
      return; // Stop if extraction fails
    }

    // Step 2: Index Text
    try {
      await updateSourceStatus(sourceToProcess.id, level, { indexingStatus: 'pending' });
      const { chunksWritten, success, error } = await indexDocument({
        sourceId: sourceToProcess.id,
        sourceName: sourceToProcess.name,
        text: extractedText,
        level: level,
        topic: sourceToProcess.topic || 'General',
        downloadURL: sourceToProcess.downloadURL,
      });

      if (success) {
        await updateSourceStatus(sourceToProcess.id, level, { indexingStatus: 'indexed' });
        toast({ title: "Indexing Complete", description: `Wrote ${chunksWritten} chunks for ${sourceToProcess.name}.` });
      } else {
        throw new Error(error || "An unknown indexing error occurred.");
      }
    } catch (e: any) {
      console.error(`[KBPage - triggerProcessing - Indexing] Error for source ${sourceToProcess.name}:`, e);
      const errorMessage = e.message || 'An unknown error occurred during indexing.';
      await updateSourceStatus(sourceToProcess.id, level, { indexingStatus: 'failed', indexingError: errorMessage });
      toast({ title: "Indexing Failed", description: `${sourceToProcess.name}: ${errorMessage}`, variant: "destructive", duration: 10000 });
    } finally {
      setIsProcessingId(null);
    }
  }, [toast, conversationalTopics, updateSourceStatus]);
  
  const handleUpload = useCallback(async (fileToUpload: File, targetLevel: KnowledgeBaseLevel, topic: string, description: string) => {
    if (!fileToUpload) {
      throw new Error("No file was provided to the upload handler.");
    }

    const config = KB_CONFIG[targetLevel];
    const setSources = getSourcesSetter(targetLevel);
        
    const permanentId = `fb-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const filePath = `${config.storageFolder}${permanentId}-${fileToUpload.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const fileRef = storageRef(storage, filePath);
    
    try {
      toast({ title: "Upload Started", description: `Uploading ${fileToUpload.name}...` });
      await uploadBytes(fileRef, fileToUpload);
      const downloadURL = await getDownloadURL(fileRef);

      let fileType: KnowledgeSource['type'] = 'other';
      if (fileToUpload.type.startsWith('audio/')) fileType = 'audio';
      else if (fileToUpload.type.startsWith('image/')) fileType = 'image';
      else if (fileToUpload.type === 'application/pdf') fileType = 'pdf';
      else if (fileToUpload.type.startsWith('text/')) fileType = 'text';
      else if (fileToUpload.name.match(/\.(doc|docx|rtf|odt)$/i)) fileType = 'document';

      const isProcessable = ['pdf', 'text', 'document'].includes(fileType);

      const newSource: KnowledgeSource = {
        id: permanentId, name: fileToUpload.name, type: fileType,
        size: `${(fileToUpload.size / 1024 / 1024).toFixed(2)} MB`,
        uploadedAt: new Date().toISOString(),
        storagePath: filePath, downloadURL: downloadURL,
        description: description || '',
        topic: topic,
        extractionStatus: isProcessable ? 'pending' as const : 'not_applicable' as const,
        indexingStatus: isProcessable ? 'pending' as const : 'not_applicable' as const,
      };
      
      setSources(prev => {
        const updatedList = [newSource, ...prev];
        saveSourcesToFirestore(updatedList, targetLevel)
          .then(savedToDb => {
            if (!savedToDb) {
              console.error(`[KBPage - saveSources] Failed to save DB state for ${targetLevel}, but UI was updated.`);
              toast({ title: "DB Save Failed", description: "UI updated, but backend save failed. Please refresh.", variant: "destructive" });
            }
          });
        return updatedList;
      });

      toast({ title: "Upload Successful", description: `${fileToUpload.name} saved to ${targetLevel} KB.` });
      
      if (isProcessable) {
        triggerProcessing(newSource, targetLevel);
      }
    } catch (error: any) {
      console.error("[KBPage - handleUpload] Error:", error);
      toast({ title: "Upload Failed", description: error.message, variant: "destructive"});
      throw error;
    }
  }, [getSourcesSetter, saveSourcesToFirestore, triggerProcessing, toast]);

  const handleFileUpload = async () => {
    if (selectedFile && selectedTopicForUpload) {
      setIsCurrentlyUploading(true);
      try {
        await handleUpload(selectedFile, selectedKBTargetForUpload, selectedTopicForUpload, uploadDescription);
        setSelectedFile(null);
        setUploadDescription('');
        setSelectedTopicForUpload('');
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (error) {
        // Error toast is already shown in handleUpload
      } finally {
        setIsCurrentlyUploading(false);
      }
    } else {
      toast({ title: "Missing Information", description: "Please select a file and a topic.", variant: "destructive" });
    }
  };

  const handleDelete = useCallback(async (id: string, level: KnowledgeBaseLevel) => {
    const setSources = getSourcesSetter(level);
    const sources = getSourcesState(level);
    const sourceToDelete = sources.find(s => s.id === id);
    if (!sourceToDelete) return;

    try {
        if (sourceToDelete.storagePath && sourceToDelete.downloadURL) { // Only delete from storage if it's a real file
            await deleteObject(storageRef(storage, sourceToDelete.storagePath));
        }

        const chunksQuery = query(collection(db, "kb_chunks"), where("sourceId", "==", id));
        const chunksSnapshot = await getDocs(chunksQuery);
        if (!chunksSnapshot.empty) {
            const batch = writeBatch(db);
            chunksSnapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            toast({ title: "Indexed Chunks Removed", description: `${chunksSnapshot.size} associated chunks deleted.` });
        }

        const updatedSources = sources.filter(source => source.id !== id);
        setSources(updatedSources);
        await saveSourcesToFirestore(updatedSources, level);
        toast({ title: "Source Removed", description: `${sourceToDelete.name} and its data removed.` });

    } catch (error: any) {
        console.error(`[KBPage - handleDelete] Error:`, error);
        toast({ title: "Deletion Error", description: `Failed to remove ${sourceToDelete.name}: ${error.message}`, variant: "destructive" });
    }
  }, [getSourcesState, getSourcesSetter, saveSourcesToFirestore, toast]);

  const handleOpenMoveDialog = useCallback((source: KnowledgeSource, currentLevel: KnowledgeBaseLevel) => {
    setSourceToMoveDetails({ source, currentLevel });
    setSelectedTargetMoveLevel(null);
    setShowMoveDialog(true);
  }, []);

  const handleConfirmMoveSource = useCallback(async () => {
    if (!sourceToMoveDetails || !selectedTargetMoveLevel) return;

    const { source, currentLevel } = sourceToMoveDetails;
    const targetLevel = selectedTargetMoveLevel;
    if (currentLevel === targetLevel) return;

    setIsMovingSource(true);
    toast({ title: "Move Started", description: `Moving ${source.name}...` });

    try {
        let movedSource: KnowledgeSource = { ...source };

        if (source.downloadURL && source.storagePath) {
            const blob = await getBlob(storageRef(storage, source.storagePath));
            const newStoragePath = `${KB_CONFIG[targetLevel].storageFolder}${source.storagePath.split('/').pop()}`;
            const newFileRef = storageRef(storage, newStoragePath);
            await uploadBytes(newFileRef, blob, { contentType: blob.type });
            const newDownloadURL = await getDownloadURL(newFileRef);
            await deleteObject(storageRef(storage, source.storagePath));
            movedSource = { ...source, storagePath: newStoragePath, downloadURL: newDownloadURL };
        }
        
        const chunksQuery = query(collection(db, "kb_chunks"), where("sourceId", "==", source.id));
        const chunksSnapshot = await getDocs(chunksQuery);
        if (!chunksSnapshot.empty) {
            const batch = writeBatch(db);
            chunksSnapshot.forEach(doc => batch.update(doc.ref, { level: targetLevel }));
            await batch.commit();
            toast({ title: "Chunk Levels Updated", description: `${chunksSnapshot.size} chunks updated.` });
        }
        
        getSourcesSetter(targetLevel)(prev => [movedSource, ...prev].sort((a,b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()));
        getSourcesSetter(currentLevel)(prev => prev.filter(s => s.id !== source.id));
        
        await saveSourcesToFirestore([movedSource, ...getSourcesState(targetLevel)], targetLevel);
        await saveSourcesToFirestore(getSourcesState(currentLevel).filter(s => s.id !== source.id), currentLevel);

        toast({ title: "Move Successful", description: `${source.name} moved to ${targetLevel}.` });

    } catch (error: any) { 
      toast({ title: "Move Failed", description: `Could not move source: ${error.message}.`, variant: "destructive" });
      fetchSourcesForLevel(currentLevel); 
      fetchSourcesForLevel(targetLevel);
    } finally {
      setIsMovingSource(false);
      setShowMoveDialog(false);
    }
  }, [sourceToMoveDetails, selectedTargetMoveLevel, toast, getSourcesSetter, saveSourcesToFirestore, fetchSourcesForLevel, getSourcesState]);

  const handleOpenDescriptionDialog = useCallback((source: KnowledgeSource, level: KnowledgeBaseLevel) => {
    setEditingSourceDetails({ source, level });
    setDescriptionInput(source.description || '');
    setShowDescriptionDialog(true);
  }, []);

  const handleSaveDescription = useCallback(async () => {
    if (!editingSourceDetails) return;
    setIsSavingDescription(true);
    const { source, level } = editingSourceDetails;
    const sources = getSourcesState(level);
    const updatedSources = sources.map(s => s.id === source.id ? { ...s, description: descriptionInput } : s);
    getSourcesSetter(level)(updatedSources);
    await saveSourcesToFirestore(updatedSources, level);
    toast({ title: "Description Saved" });
    setIsSavingDescription(false);
    setShowDescriptionDialog(false);
  }, [editingSourceDetails, descriptionInput, getSourcesState, getSourcesSetter, saveSourcesToFirestore, toast]);
  
  const handleIndexPastedText = async () => {
    if (!pastedText.trim() || !pastedTextSourceName.trim() || !selectedTopicForPastedText) {
      toast({ title: "Missing Information", description: "Please provide a source name, topic, and text to index.", variant: "destructive" });
      return;
    }
    setIsIndexingPastedText(true);
    
    try {
        const finalSourceName = pastedTextSourceName.toLowerCase().endsWith('.txt') 
          ? pastedTextSourceName 
          : `${pastedTextSourceName}.txt`;

        const textAsBlob = new Blob([pastedText], { type: 'text/plain' });
        const textAsFile = new File([textAsBlob], finalSourceName.replace(/[^a-zA-Z0-9._-]/g, '_'), { type: 'text/plain' });
        
        await handleUpload(textAsFile, selectedKBTargetForPastedText, selectedTopicForPastedText, pastedTextDescription);
        
        toast({ title: "Text Submitted Successfully", description: `Now processing for the ${selectedKBTargetForPastedText} knowledge base.` });
        setPastedText('');
        setPastedTextSourceName('');
        setPastedTextDescription('');
        setSelectedTopicForPastedText('');

    } catch (error: any) {
        console.error("[KBPage - handleIndexPastedText] Error:", error);
        toast({
            title: "Pasted Text Submission Failed",
            description: `An error occurred: ${error.message || 'Please check the console for details.'}`,
            variant: "destructive",
            duration: 10000,
        });
    } finally {
        setIsIndexingPastedText(false);
    }
  };

  const handleProcessSmeTranscript = async () => {
    if (!smeTranscript.trim() || !smeTranscriptSourceName.trim() || !selectedTopicForSme) {
      toast({ title: "Missing Information", description: "Please provide a source name, topic, and transcript.", variant: "destructive" });
      return;
    }
    setIsProcessingSme(true);
    try {
        const { success, error } = await ingestSmeTranscript({
            transcript: smeTranscript,
            sourceName: smeTranscriptSourceName,
            level: selectedKBTargetForSme,
            topic: selectedTopicForSme,
        });

        if (success) {
            toast({ title: "SME Transcript Submitted", description: "Successfully redacted and indexed transcript." });
            setSmeTranscript('');
            setSmeTranscriptSourceName('');
            setSelectedTopicForSme('');
            fetchSourcesForLevel(selectedKBTargetForSme); // Refresh the list
        } else {
            throw new Error(error || "An unknown error occurred during SME transcript processing.");
        }
    } catch (e: any) {
        toast({ title: "Transcript Processing Failed", description: e.message, variant: "destructive", duration: 10000 });
    } finally {
        setIsProcessingSme(false);
    }
  };


  const handleTestKnowledgeBase = async () => {
    if (!testQuery) {
        toast({ title: "No Query", description: "Please enter a test question.", variant: "destructive" });
        return;
    }
    setIsTesting(true);
    setTestResult('');
    try {
        const { retrievedContext } = await testKnowledgeBase({ query: testQuery });
        setTestResult(retrievedContext);
    } catch (e: any) {
        console.error("[KBPage - Test] Error:", e);
        setTestResult(`An error occurred: ${e.message}`);
        toast({ title: "Test Failed", description: e.message, variant: "destructive", duration: 10000 });
    }
    setIsTesting(false);
  };

  const handleTestEmbedding = async () => {
    setIsTestingEmbedding(true);
    try {
      const { success, error, embeddingVectorLength } = await testEmbedding();
      if (success) {
        toast({ title: "Embedding Test Successful", description: `Successfully generated an embedding with ${embeddingVectorLength} dimensions.` });
      } else {
        toast({ title: "Embedding Test Failed", description: error, variant: "destructive", duration: 10000 });
      }
    } catch (e: any) {
      toast({ title: "Embedding Test Error", description: `An unexpected error occurred: ${e.message}`, variant: "destructive", duration: 10000 });
    }
    setIsTestingEmbedding(false);
  };

  const handleTestGeneration = async () => {
    setIsTestingGeneration(true);
    try {
      const { success, error, generatedText } = await testTextGeneration();
      if (success) {
        toast({ title: "Text Generation Test Successful", description: `AI response: "${generatedText}"` });
      } else {
        toast({ title: "Text Generation Test Failed", description: error, variant: "destructive", duration: 10000 });
      }
    } catch (e: any) {
      toast({ title: "Generation Test Error", description: `An unexpected error occurred: ${e.message}`, variant: "destructive", duration: 10000 });
    }
    setIsTestingGeneration(false);
  };

  const anyOperationGloballyInProgress = isCurrentlyUploading || isMovingSource || isSavingDescription || !!isProcessingId || isIndexingPastedText || isTesting || isTestingEmbedding || isTestingGeneration || isProcessingSme;

  const renderProcessingStatus = (source: KnowledgeSource, level: KnowledgeBaseLevel) => {
    const isThisSourceProcessing = isProcessingId === source.id;
    const processable = ['pdf', 'text', 'document'].includes(source.type);

    if (isThisSourceProcessing) {
      return <div className="flex items-center gap-2 text-blue-600"><Loader2 className="h-4 w-4 animate-spin" /><span>Processing...</span></div>;
    }
    if (!processable) {
      return <span className="text-xs text-muted-foreground">Not Applicable</span>;
    }

    const hasFailed = source.extractionStatus === 'failed' || source.indexingStatus === 'failed';
    const isIndexed = source.indexingStatus === 'indexed';

    return (
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => triggerProcessing(source, level)} disabled={anyOperationGloballyInProgress}>
                    <RefreshCw className={`h-4 w-4 ${isIndexed ? 'text-green-600' : hasFailed ? 'text-destructive' : ''}`} />
                </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isIndexed ? "Successfully indexed. Click to re-process." : hasFailed ? "Processing failed. Click to retry." : "Ready to process."}</p>
              {source.extractionError && <p className="text-destructive text-xs">Extraction: {source.extractionError}</p>}
              {source.indexingError && <p className="text-destructive text-xs">Indexing: {source.indexingError}</p>}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  };


  const renderKnowledgeBaseSection = (level: KnowledgeBaseLevel) => {
    const sources = getSourcesState(level);
    const isLoadingSources = anyKbLoading;
    const config = KB_CONFIG[level];

    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="font-headline">{config.title}</CardTitle>
          <CardDescription>
            {level === 'Archive' ? "Archived sources are not used by the AI." : `Manage ${level.toLowerCase()} priority sources.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingSources ? (
             <div className="flex justify-center py-10"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
          ) : sources.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground"><AlertCircle className="mx-auto h-12 w-12 mb-4" /><p>No sources found.</p></div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Download</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>{getFileIcon(source.type)}</TableCell>
                  <TableCell className="font-medium truncate max-w-xs">{source.name}</TableCell>
                  <TableCell className="font-medium capitalize">{source.topic || 'General'}</TableCell>
                  <TableCell><Button variant="link" size="sm" onClick={() => handleOpenDescriptionDialog(source, level)}><Edit3 className="h-3 w-3 mr-1" /> View/Edit</Button></TableCell>
                  <TableCell>{source.size}</TableCell>
                  <TableCell>{new Date(source.uploadedAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {source.downloadURL ? (
                        <a href={source.downloadURL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline"><Download className="h-4 w-4" /></a>
                    ) : (
                        <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>{renderProcessingStatus(source, level)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenMoveDialog(source, level)} disabled={anyOperationGloballyInProgress}><ArrowRightLeft className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(source.id, level)} disabled={anyOperationGloballyInProgress}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-6">
       <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><Beaker /> Core Service Diagnostics</CardTitle>
            <CardDescription>
                Use these buttons to perform direct, isolated tests of the core Google AI services. This helps confirm your API key and project setup are correct, bypassing the RAG pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
              <Button onClick={handleTestGeneration} disabled={anyOperationGloballyInProgress}>
                  {isTestingGeneration ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquareText className="mr-2 h-4 w-4" />}
                  Test Text Generation
              </Button>
              <Button onClick={handleTestEmbedding} disabled={anyOperationGloballyInProgress}>
                  {isTestingEmbedding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Beaker className="mr-2 h-4 w-4" />}
                  Test Embedding Service
              </Button>
          </CardContent>
      </Card>
      
      <Card>
          <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2"><BrainCircuit /> Test Knowledge Base Retrieval</CardTitle>
              <CardDescription>
                  Enter a question to see what context the AI would retrieve from the knowledge base. This tests the full RAG pipeline, including your indexed data in Firestore.
              </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="space-y-2">
                  <Label htmlFor="test-query">Test Question</Label>
                  <Input id="test-query" value={testQuery} onChange={(e) => setTestQuery(e.target.value)} placeholder="e.g., What are the regulations for jewelry?" suppressHydrationWarning disabled={anyOperationGloballyInProgress}/>
              </div>
              <Button onClick={handleTestKnowledgeBase} disabled={anyOperationGloballyInProgress || !testQuery}>
                  {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SearchCheck className="mr-2 h-4 w-4" />}
                  Test Retrieval
              </Button>
              {(isTesting || testResult) && (
                  <div className="space-y-2 pt-4">
                      <Label>Retrieved Context for AI</Label>
                      <Textarea readOnly value={isTesting ? "Testing..." : testResult} className="h-64 font-mono text-xs bg-muted" suppressHydrationWarning />
                  </div>
              )}
          </CardContent>
      </Card>

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
                      {availableTopics.map(topic => <SelectItem key={topic} value={topic}>{topic}</SelectItem>)}
                  </SelectContent>
              </Select>
            </div>
          <div className="space-y-2">
            <Label>Priority Level</Label>
            <RadioGroup value={selectedKBTargetForUpload} onValueChange={(v) => setSelectedKBTargetForUpload(v as KnowledgeBaseLevel)} className="flex space-x-4">
                {KB_LEVELS.filter(l => l !== 'Archive').map(level => (
                  <div key={level} className="flex items-center space-x-2"><RadioGroupItem value={level} id={`r-${level}`} /><Label htmlFor={`r-${level}`}>{level}</Label></div>
                ))}
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="uploadDescription">Description (Optional)</Label>
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
      
      <Card>
        <CardHeader>
            <CardTitle className="font-headline">Index Pasted Text</CardTitle>
            <CardDescription>
                Paste text directly to index it. It will be saved as a .txt file and processed.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="pasted-text-source-name">Source Name</Label>
                <Input id="pasted-text-source-name" value={pastedTextSourceName} onChange={(e) => setPastedTextSourceName(e.target.value)} placeholder="e.g., 'Company Mission Statement'" suppressHydrationWarning />
            </div>
             <div className="space-y-2">
              <Label>Topic</Label>
              <Select value={selectedTopicForPastedText} onValueChange={setSelectedTopicForPastedText}>
                  <SelectTrigger><SelectValue placeholder="Select a topic..." /></SelectTrigger>
                  <SelectContent>
                      {availableTopics.map(topic => <SelectItem key={`pasted-${topic}`} value={topic}>{topic}</SelectItem>)}
                  </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
                <Label>Priority Level</Label>
                <RadioGroup value={selectedKBTargetForPastedText} onValueChange={(v) => setSelectedKBTargetForPastedText(v as KnowledgeBaseLevel)} className="flex space-x-4">
                    {KB_LEVELS.filter(l => l !== 'Archive').map(level => (
                        <div key={`pasted-${level}`} className="flex items-center space-x-2"><RadioGroupItem value={level} id={`rp-${level}`} /><Label htmlFor={`rp-${level}`}>{level}</Label></div>
                    ))}
                </RadioGroup>
            </div>
            <div className="space-y-2">
                <Label htmlFor="pastedTextDescription">Description (Optional)</Label>
                <Textarea id="pastedTextDescription" value={pastedTextDescription} onChange={(e) => setPastedTextDescription(e.target.value)} placeholder="Briefly describe the text..." suppressHydrationWarning />
            </div>
            <div className="space-y-2">
                <Label htmlFor="pasted-text-content">Text Content</Label>
                <Textarea id="pasted-text-content" value={pastedText} onChange={(e) => setPastedText(e.target.value)} placeholder="Paste your text content here..." rows={10} suppressHydrationWarning />
            </div>
        </CardContent>
        <CardFooter>
            <Button onClick={handleIndexPastedText} disabled={!pastedText.trim() || !pastedTextSourceName.trim() || !selectedTopicForPastedText || anyOperationGloballyInProgress}>
              {isIndexingPastedText ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
              Save & Process Pasted Text
            </Button>
        </CardFooter>
    </Card>
    
    <Card>
        <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><FileQuestion /> Ingest SME Transcript</CardTitle>
            <CardDescription>
                Paste an anonymized SME conversation. It will be automatically redacted for any remaining PII and then indexed.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="sme-source-name">Source Name</Label>
                <Input id="sme-source-name" value={smeTranscriptSourceName} onChange={(e) => setSmeTranscriptSourceName(e.target.value)} placeholder="e.g., 'SME Chat on Loan Performance'" suppressHydrationWarning />
            </div>
             <div className="space-y-2">
              <Label>Topic</Label>
              <Select value={selectedTopicForSme} onValueChange={setSelectedTopicForSme}>
                  <SelectTrigger><SelectValue placeholder="Select a topic..." /></SelectTrigger>
                  <SelectContent>
                      {availableTopics.map(topic => <SelectItem key={`sme-${topic}`} value={topic}>{topic}</SelectItem>)}
                  </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
                <Label>Priority Level</Label>
                <RadioGroup value={selectedKBTargetForSme} onValueChange={(v) => setSelectedKBTargetForSme(v as KnowledgeBaseLevel)} className="flex space-x-4">
                    {KB_LEVELS.filter(l => l !== 'Archive').map(level => (
                        <div key={`sme-${level}`} className="flex items-center space-x-2"><RadioGroupItem value={level} id={`rs-${level}`} /><Label htmlFor={`rs-${level}`}>{level}</Label></div>
                    ))}
                </RadioGroup>
            </div>
            <div className="space-y-2">
                <Label htmlFor="sme-transcript-content">SME Transcript</Label>
                <Textarea id="sme-transcript-content" value={smeTranscript} onChange={(e) => setSmeTranscript(e.target.value)} placeholder="Paste the full SME Q&A transcript here..." rows={10} suppressHydrationWarning />
            </div>
        </CardContent>
        <CardFooter>
            <Button onClick={handleProcessSmeTranscript} disabled={!smeTranscript.trim() || !smeTranscriptSourceName.trim() || !selectedTopicForSme || anyOperationGloballyInProgress}>
              {isProcessingSme ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
              Redact & Process Transcript
            </Button>
        </CardFooter>
    </Card>

    <Accordion type="multiple" defaultValue={['high-kb', 'medium-kb']} className="w-full">
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
          <AlertDialogHeader><AlertDialogTitle>Move Knowledge Source</AlertDialogTitle><AlertDialogDescription>Move &quot;{sourceToMoveDetails.source.name}&quot; from {sourceToMoveDetails.currentLevel} to:</AlertDialogDescription></AlertDialogHeader>
          <RadioGroup value={selectedTargetMoveLevel ?? undefined} onValueChange={(v) => setSelectedTargetMoveLevel(v as KnowledgeBaseLevel)} className="my-4 space-y-2">
            {KB_LEVELS.filter(l => l !== sourceToMoveDetails.currentLevel).map(level => (
              <div key={`move-${level}`} className="flex items-center space-x-2"><RadioGroupItem value={level} id={`rm-${level}`} /><Label htmlFor={`rm-${level}`}>{level}</Label></div>
            ))}
          </RadioGroup>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMovingSource}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmMoveSource} disabled={!selectedTargetMoveLevel || isMovingSource}>
              {isMovingSource && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Move
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )}

    {editingSourceDetails && (
      <Dialog open={showDescriptionDialog} onOpenChange={setShowDescriptionDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Description</DialogTitle><DialogDescription>For: {editingSourceDetails.source.name}</DialogDescription></DialogHeader>
          <Textarea value={descriptionInput} onChange={(e) => setDescriptionInput(e.target.value)} rows={5} disabled={isSavingDescription} suppressHydrationWarning />
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={isSavingDescription}>Cancel</Button></DialogClose>
            <Button onClick={handleSaveDescription} disabled={isSavingDescription}>
              {isSavingDescription ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}
    </div>
  );
}

    