import { File } from 'expo-file-system';
import { createVideoPlayer, VideoThumbnail } from 'expo-video';
import { getFrameAt, isValidFile } from 'react-native-video-trim';

type Player = ReturnType<typeof createVideoPlayer>;

// getFrameAt / the camera return bare fs paths; expo's File wants a file:// URI.
const toFileUri = (path: string) => (path.startsWith('/') ? `file://${path}` : path);

/** Resolves once the player is ready to read metadata / frames (or errors / times out). */
function whenReady(player: Player): Promise<void> {
  return new Promise((resolve) => {
    if (player.status === 'readyToPlay') return resolve();
    const done = () => {
      clearTimeout(timer);
      sub.remove();
      resolve();
    };
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' || status === 'error') done();
    });
    const timer = setTimeout(done, 5000);
  });
}

/**
 * Extract the first frame of a clip as a jpeg via RNVT's native `getFrameAt` and move it to
 * `destAbsUri` (its persisted home in the draft dir). Returns false on failure, leaving the
 * caller to store a null thumbnail (the runtime `generateThumbnail` fallback then covers it).
 */
export async function generateThumbnailFile(
  videoAbsUri: string,
  destAbsUri: string,
): Promise<boolean> {
  try {
    const { outputPath } = await getFrameAt(videoAbsUri, {
      time: 0,
      format: 'jpeg',
      quality: 80,
      maxWidth: 192,
      maxHeight: 256,
    });
    const dest = new File(destAbsUri);
    if (dest.exists) dest.delete();
    await new File(toFileUri(outputPath)).move(dest);
    return true;
  } catch (e) {
    console.warn('[video] thumbnail file failed for', videoAbsUri, e);
    return false;
  }
}

// VideoThumbnail is a native SharedRef with no file URI. Legacy fallback for rows persisted
// before disk thumbnails existed (null `thumbnail` column). Cached by uri.
const thumbnailCache = new Map<string, VideoThumbnail>();

/** First-frame thumbnail for a clip, cached by uri. Undefined on failure. */
export async function generateThumbnail(uri: string): Promise<VideoThumbnail | undefined> {
  const cached = thumbnailCache.get(uri);
  if (cached) return cached;

  let player: Player | undefined;
  try {
    player = createVideoPlayer(uri);
    await whenReady(player);
    const thumbs = await player.generateThumbnailsAsync(0, { maxWidth: 96, maxHeight: 128 });
    const thumb = thumbs[0];
    if (thumb) thumbnailCache.set(uri, thumb);
    return thumb;
  } catch (e) {
    console.warn('[video] thumbnail failed for', uri, e);
    return undefined;
  } finally {
    player?.release();
  }
}

/**
 * Native clip duration in ms via RNVT's `isValidFile` probe — no player to spin up. 0 on an
 * invalid/unreadable file (the clip is then skipped on playback and merge).
 */
export async function getDurationMs(uri: string): Promise<number> {
  try {
    const info = await isValidFile(uri);
    return info.isValid && info.duration > 0 ? info.duration : 0;
  } catch (e) {
    console.warn('[video] duration failed for', uri, e);
    return 0;
  }
}
