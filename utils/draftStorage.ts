import { RecordingSegment } from '@/components/RecordingProgressBar';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Draft {
  id: string;
  segments: RecordingSegment[];
  totalDuration: number;
  createdAt: Date;
  thumbnail?: string;
}

const DRAFTS_STORAGE_KEY = 'recording_drafts';

export class DraftStorage {
  static async saveDraft(segments: RecordingSegment[], totalDuration: number): Promise<string> {
    try {
      const existingDrafts = await this.getAllDrafts();
      
      const newDraft: Draft = {
        id: Date.now().toString(),
        segments,
        totalDuration,
        createdAt: new Date(),
        thumbnail: segments[0]?.uri,
      };
      
      const updatedDrafts = [...existingDrafts, newDraft];
      await AsyncStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updatedDrafts));
      
      return newDraft.id;
    } catch (error) {
      console.error('Error saving draft:', error);
      throw error;
    }
  }
  
  static async saveDraftArray(drafts: Draft[]): Promise<void> {
    try {
      await AsyncStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    } catch (error) {
      console.error('Error saving draft array:', error);
      throw error;
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
  
  static async clearAllDrafts(): Promise<void> {
    try {
      await AsyncStorage.removeItem(DRAFTS_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing drafts:', error);
      throw error;
    }
  }
} 