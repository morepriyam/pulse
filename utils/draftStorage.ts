import { RecordingSegment } from '@/components/RecordingProgressBar';
import { fileStore } from '@/utils/fileStore';
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
        console.log(`[DraftStorage] Generating thumbnail for draft: ${targetId}`);
        // Convert relative path to absolute path for thumbnail generation
        const absoluteUri = fileStore.toAbsolutePath(segments[0].uri);
        const tempThumb = await generateVideoThumbnail(absoluteUri);
        if (tempThumb) {
          await fileStore.ensureDraftDirs(targetId);
          thumbnailUri = await fileStore.importThumbnail({
            draftId: targetId,
            srcUri: tempThumb,
            name: 'thumb',
          });
          console.log(`[DraftStorage] Thumbnail generated and imported for draft: ${targetId}`);
        } else {
          console.log(`[DraftStorage] Failed to generate thumbnail for draft: ${targetId}`);
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
      
      console.log(`[DraftStorage] Saved draft: ${newDraft.id} (${segments.length} segments, ${totalDuration}s, mode: ${mode})`);
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
      console.log(`[DraftStorage] Updated draft: ${id} (${segments.length} segments, ${totalDuration}s)`);
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
      
      if (mostRecent) {
        // Validate the draft's files exist before returning
        const validatedDraft = await this.getDraftById(mostRecent.id, mode);
        if (validatedDraft) {
          console.log(`[DraftStorage] Found last modified draft: ${validatedDraft.id} (${validatedDraft.segments.length} segments, mode: ${validatedDraft.mode})`);
          return validatedDraft;
        } else {
          console.log(`[DraftStorage] Last modified draft ${mostRecent.id} is corrupted, trying next most recent`);
          // Try to find the next most recent valid draft
          const remainingDrafts = filteredDrafts.filter(d => d.id !== mostRecent.id);
          if (remainingDrafts.length > 0) {
            return this.getLastModifiedDraft(mode);
          }
        }
      }
      return null;
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
        console.log(`[DraftStorage] Draft ${id} mode mismatch: expected ${mode}, got ${draft.mode}`);
        return null;
      }
      
      if (draft) {
        // Validate that all segment files still exist
        const validSegments = [];
        for (const segment of draft.segments) {
          // Convert relative path to absolute path for validation
          const absoluteUri = fileStore.toAbsolutePath(segment.uri);
          const exists = await fileStore.validateFileExists(absoluteUri);
          if (exists) {
            validSegments.push(segment);
          } else {
            console.warn(`[DraftStorage] Segment file missing: ${segment.uri}`);
          }
        }
        
        // If no valid segments remain, the draft is corrupted
        if (validSegments.length === 0 && draft.segments.length > 0) {
          console.warn(`[DraftStorage] Draft ${id} has no valid segments, removing from storage`);
          await this.deleteDraft(id);
          return null;
        }
        
        // Update draft with valid segments only
        if (validSegments.length !== draft.segments.length) {
          console.log(`[DraftStorage] Updating draft ${id} with ${validSegments.length} valid segments (removed ${draft.segments.length - validSegments.length} missing)`);
          await this.updateDraft(id, validSegments, draft.totalDuration);
          draft.segments = validSegments;
        }
        
        console.log(`[DraftStorage] Retrieved draft: ${id} (${draft.segments.length} segments, mode: ${draft.mode})`);
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
      console.log(`[DraftStorage] Deleted draft: ${id} (files ${options?.keepFiles ? 'kept' : 'deleted'})`);
    } catch (error) {
      console.error('Error deleting draft:', error);
      throw error;
    }
  }
} 