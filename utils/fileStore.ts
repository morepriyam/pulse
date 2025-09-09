import * as FileSystem from 'expo-file-system';

const BASE_DIR = `${FileSystem.documentDirectory}pulse/`;

const paths = {
  baseDir: () => BASE_DIR,
  draftDir: (draftId: string) => `${BASE_DIR}drafts/${draftId}/`,
  segmentsDir: (draftId: string) => `${BASE_DIR}drafts/${draftId}/segments/`,
  thumbsDir: (draftId: string) => `${BASE_DIR}drafts/${draftId}/thumbs/`,
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
    console.log(`[fileStore] Segment imported: ${finalDst}`);
    return finalDst;
  },

  deleteDraftDirectory: async (draftId: string) => {
    const dir = paths.draftDir(draftId);
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) {
      console.log(`[fileStore] Deleting draft directory: ${dir}`);
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
  },

  deleteUris: async (uris: string[]) => {
    if (uris.length > 0) console.log(`[fileStore] Deleting ${uris.length} file(s)`);
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
    console.log(`[fileStore] Thumbnail imported: ${dst}`);
    return dst;
  },

  getExistingThumbnailUri: async (draftId: string): Promise<string | null> => {
    const dir = paths.thumbsDir(draftId);
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) return null;
      const items = await FileSystem.readDirectoryAsync(dir);
      if (items.length === 0) return null;
      const preferred = items.find((n) => n.startsWith('thumb.')) || items[0];
      return `${dir}${preferred}`;
    } catch {
      return null;
    }
  },
};

export default fileStore;


