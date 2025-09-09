import { RecordingSegment } from '@/components/RecordingProgressBar';
import fileStore from '@/utils/fileStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateVideoThumbnail } from './videoThumbnails';

export type DraftMode = 'camera' | 'upload';

export interface Draft {
  id: string;
  mode: DraftMode;
  segments: RecordingSegment[];
  totalDuration: number;
  createdAt: Date;
  lastModified: Date;
  thumbnail?: string;
}

const DRAFTS_STORAGE_KEY = 'recording_drafts';

/**
 * Utility class for managing draft video recordings in AsyncStorage.
 * 
 * Provides CRUD operations for drafts with automatic thumbnail generation
 * and metadata management.
 */
export class DraftStorage {
  static async saveDraft(
    segments: RecordingSegment[],
    totalDuration: number,
    mode: DraftMode = 'camera',
    customId?: string
  ): Promise<string> {
    try {
      const existingDrafts = await this.getAllDrafts();

      // Determine target id up-front to keep thumbs in the same folder
      const targetId = customId || Date.now().toString();
      let thumbnailUri: string | undefined;
      // Reuse existing thumbnail if present (e.g., redo recreate)
      const existingThumb = await fileStore.getExistingThumbnailUri(targetId);
      if (existingThumb) {
        thumbnailUri = existingThumb;
      }
      // Otherwise, generate & import a new thumbnail
      if (!thumbnailUri && segments.length > 0 && segments[0].uri) {
        const tempThumb = await generateVideoThumbnail(segments[0].uri);
        if (tempThumb) {
          await fileStore.ensureDraftDirs(targetId);
          thumbnailUri = await fileStore.importThumbnail({
            draftId: targetId,
            srcUri: tempThumb,
            name: 'thumb',
          });
        }
      }
      
      const now = new Date();
      const newDraftId = targetId;
      const newDraft: Draft = {
        id: newDraftId,
        mode,
        segments,
        totalDuration,
        createdAt: now,
        lastModified: now,
        thumbnail: thumbnailUri,
      };
      
      // Replace existing draft with same ID or append new one
      const updatedDrafts = existingDrafts.filter(draft => draft.id !== newDraft.id);
      updatedDrafts.push(newDraft);
      await AsyncStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updatedDrafts));
      
      return newDraft.id;
    } catch (error) {
      console.error('Error saving draft:', error);
      throw error;
    }
  }

  static async updateDraft(id: string, segments: RecordingSegment[], totalDuration: number): Promise<void> {
    try {
      const existingDrafts = await this.getAllDrafts();
      
      const updatedDrafts = existingDrafts.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              segments,
              totalDuration,
              lastModified: new Date(),
              // Keep existing thumbnail - don't regenerate
            }
          : draft
      );
      
      await AsyncStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updatedDrafts));
    } catch (error) {
      console.error('Error updating draft:', error);
      throw error;
    }
  }

  static async getLastModifiedDraft(mode?: DraftMode): Promise<Draft | null> {
    try {
      const drafts = await this.getAllDrafts();
      if (drafts.length === 0) return null;
      
      // Filter by mode if specified
      const filteredDrafts = mode ? drafts.filter(draft => draft.mode === mode) : drafts;
      if (filteredDrafts.length === 0) return null;

      // Find the most recently modified draft
      const mostRecent = filteredDrafts.reduce((latest, current) => 
        current.lastModified.getTime() > latest.lastModified.getTime() ? current : latest
      );
      
      return mostRecent;
    } catch (error) {
      console.error('Error getting last modified draft:', error);
      return null;
    }
  }
  

  static async getAllDrafts(mode?: DraftMode): Promise<Draft[]> {
    try {
      const draftsJson = await AsyncStorage.getItem(DRAFTS_STORAGE_KEY);
      if (!draftsJson) return [];
      
      const drafts = JSON.parse(draftsJson);
      const parsedDrafts = drafts.map((draft: any) => ({
        ...draft,
        createdAt: new Date(draft.createdAt),
        lastModified: new Date(draft.lastModified || draft.createdAt), // Handle existing drafts
        mode: draft.mode || 'camera' // Default to camera for older drafts
      }));
      
      // Filter by mode if specified
      return mode ? parsedDrafts.filter((draft: Draft) => draft.mode === mode) : parsedDrafts;
    } catch (error) {
      console.error('Error getting drafts:', error);
      return [];
    }
  }
  
  static async getDraftById(id: string, mode?: DraftMode): Promise<Draft | null> {
    try {
      const drafts = await this.getAllDrafts();
      const draft = drafts.find(draft => draft.id === id);
      // If mode is specified, check if draft matches the mode
      if (draft && mode && draft.mode !== mode) {
        return null;
      }
      return draft || null;
    } catch (error) {
      console.error('Error getting draft by id:', error);
      return null;
    }
  }
  
  static async deleteDraft(id: string, options?: { keepFiles?: boolean }): Promise<void> {
    try {
      // Optionally keep files (used when last-undo should allow redo)
      if (!options?.keepFiles) {
        try {
          await fileStore.deleteDraftDirectory(id);
        } catch (e) {
          // Non-fatal: proceed with metadata cleanup
        }
      }

      const drafts = await this.getAllDrafts();
      const updatedDrafts = drafts.filter(draft => draft.id !== id);
      await AsyncStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updatedDrafts));
    } catch (error) {
      console.error('Error deleting draft:', error);
      throw error;
    }
  }
} 