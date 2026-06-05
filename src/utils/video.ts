import { createVideoPlayer, VideoThumbnail } from 'expo-video';

type Player = ReturnType<typeof createVideoPlayer>;

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

// VideoThumbnail is a native SharedRef with no file URI, so we derive first frames at
// runtime rather than persisting them. Cached by uri to avoid regenerating on re-render.
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

/** Native clip duration in ms — trust the decoded asset, not a JS timer. 0 on failure. */
export async function getDurationMs(uri: string): Promise<number> {
  let player: Player | undefined;
  try {
    player = createVideoPlayer(uri);
    await whenReady(player);
    return Math.round(player.duration * 1000);
  } catch (e) {
    console.warn('[video] duration failed for', uri, e);
    return 0;
  } finally {
    player?.release();
  }
}
