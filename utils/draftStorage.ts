import { RecordingSegment } from '@/components/RecordingProgressBar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateVideoThumbnail } from './videoThumbnails';

export interface Draft {
  id: string;
  segments: RecordingSegment[];
  totalDuration: number;
  createdAt: Date;
  lastModified: Date;
  thumbnail?: string;
}

const DRAFTS_STORAGE_KEY = 'recording_drafts';

export class DraftStorage {
  static async saveDraft(segments: RecordingSegment[], totalDuration: number): Promise<string> {
    try {
      const existingDrafts = await this.getAllDrafts();
      
      let thumbnailUri: string | undefined;
      if (segments.length > 0 && segments[0].uri) {
        thumbnailUri = await generateVideoThumbnail(segments[0].uri) || undefined;
      }
      
      const now = new Date();
      const newDraft: Draft = {
        id: Date.now().toString(),
        segments,
        totalDuration,
        createdAt: now,
        lastModified: now,
        thumbnail: thumbnailUri,
      };
      
      const updatedDrafts = [...existingDrafts, newDraft];
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

  static async getLastModifiedDraft(): Promise<Draft | null> {
    try {
      const drafts = await this.getAllDrafts();
      if (drafts.length === 0) return null;
      
      // Find the most recently modified draft
      const mostRecent = drafts.reduce((latest, current) => 
        current.lastModified.getTime() > latest.lastModified.getTime() ? current : latest
      );
      
      return mostRecent;
    } catch (error) {
      console.error('Error getting last modified draft:', error);
      return null;
    }
  }
  

  static async getAllDrafts(): Promise<Draft[]> {
    try {
      const draftsJson = await AsyncStorage.getItem(DRAFTS_STORAGE_KEY);
      if (!draftsJson) return [];
      
      const drafts = JSON.parse(draftsJson);
      return drafts.map((draft: any) => ({
        ...draft,
        createdAt: new Date(draft.createdAt),
        lastModified: new Date(draft.lastModified || draft.createdAt), // Handle existing drafts
      }));
    } catch (error) {
      console.error('Error getting drafts:', error);
      return [];
    }
  }
  
  static async getDraftById(id: string): Promise<Draft | null> {
    try {
      const drafts = await this.getAllDrafts();
      return drafts.find(draft => draft.id === id) || null;
    } catch (error) {
      console.error('Error getting draft by id:', error);
      return null;
    }
  }
  
  static async deleteDraft(id: string): Promise<void> {
    try {
      const drafts = await this.getAllDrafts();
      const updatedDrafts = drafts.filter(draft => draft.id !== id);
      await AsyncStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updatedDrafts));
    } catch (error) {
      console.error('Error deleting draft:', error);
      throw error;
    }
  }
} 