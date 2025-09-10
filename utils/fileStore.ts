import * as FileSystem from 'expo-file-system';

// Use documentDirectory for persistent user data (correct for Expo 2025)
// This directory is designed to persist across app restarts and updates
const RELATIVE_BASE_DIR = 'pulse/';

const paths = {
  baseDir: () => `${FileSystem.documentDirectory}${RELATIVE_BASE_DIR}`,
  draftDir: (draftId: string) => `${FileSystem.documentDirectory}${RELATIVE_BASE_DIR}drafts/${draftId}/`,
  segmentsDir: (draftId: string) => `${FileSystem.documentDirectory}${RELATIVE_BASE_DIR}drafts/${draftId}/segments/`,
  thumbsDir: (draftId: string) => `${FileSystem.documentDirectory}${RELATIVE_BASE_DIR}drafts/${draftId}/thumbs/`,
  // Relative paths for storage in metadata
  relativeDraftDir: (draftId: string) => `${RELATIVE_BASE_DIR}drafts/${draftId}/`,
  relativeSegmentsDir: (draftId: string) => `${RELATIVE_BASE_DIR}drafts/${draftId}/segments/`,
  relativeThumbsDir: (draftId: string) => `${RELATIVE_BASE_DIR}drafts/${draftId}/thumbs/`,
};

function getExtensionFromUri(uri: string): string {
  try {
    const noQuery = uri.split('?')[0];
    const parts = noQuery.split('.');
    if (parts.length > 1) {
      const ext = parts[parts.length - 1].toLowerCase();
      if (ext && /^[a-z0-9]+$/.test(ext)) return ext;
    }
  } catch {}
  return 'mp4';
}

// Convert absolute path to relative path for storage
function toRelativePath(absolutePath: string): string {
  const docDir = FileSystem.documentDirectory || '';
  if (absolutePath.startsWith(docDir)) {
    return absolutePath.substring(docDir.length);
  }
  return absolutePath;
}

// Convert relative path to absolute path for file operations
function toAbsolutePath(relativePath: string): string {
  return `${FileSystem.documentDirectory}${relativePath}`;
}

export const fileStore = {
  ensureDraftDirs: async (draftId: string) => {
    const segDir = paths.segmentsDir(draftId);
    const segInfo = await FileSystem.getInfoAsync(segDir);
    if (!segInfo.exists) await FileSystem.makeDirectoryAsync(segDir, { intermediates: true });

    const thDir = paths.thumbsDir(draftId);
    const thInfo = await FileSystem.getInfoAsync(thDir);
    if (!thInfo.exists) await FileSystem.makeDirectoryAsync(thDir, { intermediates: true });
  },

  importSegment: async (params: { draftId: string; srcUri: string; segmentId: string; ext?: string }): Promise<string> => {
    const { draftId, srcUri, segmentId } = params;
    const ext = params.ext || getExtensionFromUri(srcUri);
    const dst = `${paths.segmentsDir(draftId)}${segmentId}.${ext}`;

    // If destination already exists (rare), append a suffix
    const dstInfo = await FileSystem.getInfoAsync(dst);
    const finalDst = dstInfo.exists ? `${paths.segmentsDir(draftId)}${segmentId}_${Date.now()}.${ext}` : dst;

    try {
      await FileSystem.moveAsync({ from: srcUri, to: finalDst });
    } catch {
      await FileSystem.copyAsync({ from: srcUri, to: finalDst });
      // Best-effort attempt to delete source if copy was used
      try {
        await FileSystem.deleteAsync(srcUri, { idempotent: true });
      } catch {}
    }
    console.log(`[fileStore] Imported segment: ${segmentId}`);
    // Return relative path for storage in metadata
    return toRelativePath(finalDst);
  },

  deleteDraftDirectory: async (draftId: string) => {
    const dir = paths.draftDir(draftId);
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) {
      console.log(`[fileStore] Deleting draft: ${draftId}`);
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
  },

  deleteUris: async (uris: string[]) => {
    await Promise.all(
      uris.map(async (u) => {
        try {
          const info = await FileSystem.getInfoAsync(u);
          if (info.exists) await FileSystem.deleteAsync(u, { idempotent: true });
        } catch {}
      })
    );
  },

  importThumbnail: async (params: { draftId: string; srcUri: string; name?: string }): Promise<string> => {
    const { draftId, srcUri } = params;
    const ext = getExtensionFromUri(srcUri) || 'jpg';
    const fileName = `${params.name ?? 'thumb'}.${ext}`;
    const dst = `${paths.thumbsDir(draftId)}${fileName}`;

    try {
      await FileSystem.moveAsync({ from: srcUri, to: dst });
    } catch {
      await FileSystem.copyAsync({ from: srcUri, to: dst });
      try {
        await FileSystem.deleteAsync(srcUri, { idempotent: true });
      } catch {}
    }
    // Return relative path for storage in metadata
    return toRelativePath(dst);
  },

  getExistingThumbnailUri: async (draftId: string): Promise<string | null> => {
    const dir = paths.thumbsDir(draftId);
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) return null;
      const items = await FileSystem.readDirectoryAsync(dir);
      if (items.length === 0) return null;
      const preferred = items.find((n) => n.startsWith('thumb.')) || items[0];
      const fullPath = `${dir}${preferred}`;
      
      // Verify the file actually exists
      const fileInfo = await FileSystem.getInfoAsync(fullPath);
      if (!fileInfo.exists) return null;
      
      // Return relative path for storage in metadata
      return toRelativePath(fullPath);
    } catch {
      return null;
    }
  },

  // Validate that a file exists and is accessible
  validateFileExists: async (uri: string): Promise<boolean> => {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      return info.exists;
    } catch {
      return false;
    }
  },

  // Convert relative path to absolute path for file operations
  toAbsolutePath: (relativePath: string): string => {
    return toAbsolutePath(relativePath);
  },

  // Convert absolute path to relative path for storage
  toRelativePath: (absolutePath: string): string => {
    return toRelativePath(absolutePath);
  },

  // Convert segments with relative paths to absolute paths for use
  convertSegmentsToAbsolute: (segments: any[]): any[] => {
    return segments.map(segment => ({
      ...segment,
      uri: fileStore.toAbsolutePath(segment.uri)
    }));
  },

  // Get all files in a draft directory for cleanup
  getDraftFiles: async (draftId: string): Promise<string[]> => {
    const segmentsDir = paths.segmentsDir(draftId);
    const thumbsDir = paths.thumbsDir(draftId);
    const files: string[] = [];
    
    try {
      // Get segment files
      const segInfo = await FileSystem.getInfoAsync(segmentsDir);
      if (segInfo.exists) {
        const segFiles = await FileSystem.readDirectoryAsync(segmentsDir);
        files.push(...segFiles.map(f => `${segmentsDir}${f}`));
      }
      
      // Get thumbnail files
      const thumbInfo = await FileSystem.getInfoAsync(thumbsDir);
      if (thumbInfo.exists) {
        const thumbFiles = await FileSystem.readDirectoryAsync(thumbsDir);
        files.push(...thumbFiles.map(f => `${thumbsDir}${f}`));
      }
    } catch (error) {
      console.warn(`[fileStore] Error reading draft files for ${draftId}:`, error);
    }
    
    return files;
  },

  // Debug utility to check storage status
  debugStorageStatus: async (): Promise<void> => {
    try {
      const baseDir = paths.baseDir();
      console.log(`[fileStore] Base directory: ${baseDir}`);
      const baseInfo = await FileSystem.getInfoAsync(baseDir);
      console.log(`[fileStore] Base directory exists: ${baseInfo.exists}`);
      
      if (baseInfo.exists) {
        const items = await FileSystem.readDirectoryAsync(baseDir);
        console.log(`[fileStore] Base directory contents:`, items);
        
        // Check drafts directory
        const draftsDir = `${baseDir}drafts/`;
        const draftsInfo = await FileSystem.getInfoAsync(draftsDir);
        if (draftsInfo.exists) {
          const draftDirs = await FileSystem.readDirectoryAsync(draftsDir);
          console.log(`[fileStore] Draft directories:`, draftDirs);
          
          // Check a few draft directories for files
          for (const draftDir of draftDirs.slice(0, 3)) {
            const draftPath = `${draftsDir}${draftDir}/`;
            const segmentsPath = `${draftPath}segments/`;
            const thumbsPath = `${draftPath}thumbs/`;
            
            const segInfo = await FileSystem.getInfoAsync(segmentsPath);
            const thumbInfo = await FileSystem.getInfoAsync(thumbsPath);
            
            if (segInfo.exists) {
              const segFiles = await FileSystem.readDirectoryAsync(segmentsPath);
              console.log(`[fileStore] Draft ${draftDir} segments:`, segFiles);
            }
            
            if (thumbInfo.exists) {
              const thumbFiles = await FileSystem.readDirectoryAsync(thumbsPath);
              console.log(`[fileStore] Draft ${draftDir} thumbnails:`, thumbFiles);
            }
          }
        }
      }
    } catch (error) {
      console.error(`[fileStore] Debug error:`, error);
    }
  },
};

export default fileStore;


